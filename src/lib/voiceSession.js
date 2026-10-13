// Audio-only WebRTC. Firebase carries connection messages, never recorded audio.
export const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function voiceError(error) {
  if (error?.name === 'NotAllowedError') return 'Microphone permission was denied. Allow microphone access in your browser, then try again.';
  if (error?.name === 'NotFoundError') return 'No microphone found. Connect a microphone and try again.';
  if (error?.name === 'NotReadableError') return 'Your microphone is busy. Close other apps using it and try again.';
  if (/permission.denied/i.test(error?.code || error?.message || '')) return 'Voice access is unavailable. The host needs to publish the voice database rules.';
  const msg = error?.message || '';
  // Filter Vite/bundler internal errors that are not user-facing
  if (msg.includes('import _v') || msg.includes('is not valid JSON') || msg.includes('Unexpected token')) {
    return 'Voice could not connect. Please refresh the page and try again.';
  }
  return msg || 'Voice could not connect. Please try again.';
}

export class VoiceSession {
  constructor({ transport, getMedia, createPeer, getIce, onChange, onStream, now = Date.now }) {
    Object.assign(this, { transport, getMedia, createPeer, getIce, onChange, onStream, now });
    this.peers = new Map();
    this.unsubs = [];
    this.closed = false;
    this.muted = true;
    this.status = 'idle';
    this.members = [];
  }
  emit(error = '') {
    this.onChange({ status: this.status, muted: this.muted, error,
      peers: [...this.peers.values()].map(p => ({ ...p.member, status: p.state })) });
  }
  async join() {
    if (this.status !== 'idle' || this.closed) return;
    this.status = 'joining'; this.emit();
    try {
      await this.transport.checkAccess();
      if (this.closed) return;
      // The join button is the only caller; never ask permission on page load.
      const stream = await this.getMedia();
      if (this.closed) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      stream.getAudioTracks().forEach(t => {
        t.enabled = false;
        t.onended = () => this.fail('Microphone disconnected. Reconnect it and join again.');
      });
      this.ice = await this.getIce();
      if (this.closed) return;
      await this.transport.open({ muted: true });
      if (this.closed) { await this.transport.close(); return; }
      this.status = 'joined';
      const stopMembers = this.transport.watchMembers(members => {
        this.members = members;
        this.syncMembers();
      }, e => this.fail(voiceError(e)));
      if (this.closed) { stopMembers(); return; }
      this.unsubs.push(stopMembers);
      const stopConnection = this.transport.watchConnection(connected => {
        if (!connected) this.fail('Connection lost. Your microphone is off. Join voice again when you are online.');
      });
      if (this.closed) { stopConnection(); return; }
      this.unsubs.push(stopConnection);
      this.heartbeat = setInterval(() => {
        this.transport.touch({ muted: this.muted }).catch(e => this.fail(voiceError(e)));
        this.syncMembers();
      }, 15000);
      this.refresh = setInterval(async () => {
        try {
          const config = await this.getIce();
          if (this.closed) return;
          this.ice = config;
          for (const p of this.peers.values()) p.pc.setConfiguration({ iceServers: config });
        } catch { if (!this.closed) this.fail('Voice connection needs to be renewed. Please join again.'); }
      }, 30 * 60 * 1000);
      this.emit();
    } catch (e) { if (!this.closed) this.fail(voiceError(e)); }
  }
  syncMembers() {
    if (this.closed) return;
    const active = this.members.filter(m => m.uid !== this.transport.uid &&
      m.id !== this.transport.id && this.now() - m.updatedAt < 45000);
    // One connection per other account; prefer its most recent tab.
    const unique = [...new Map(active.sort((a,b) => a.updatedAt - b.updatedAt).map(m => [m.uid, m])).values()]
      .sort((a,b) => a.id.localeCompare(b.id)).slice(0, 9);
    const ids = new Set(unique.map(m => m.id));
    for (const [id, p] of this.peers) if (!ids.has(id)) this.dropPeer(p);
    for (const m of unique) {
      const p = this.peers.get(m.id);
      if (p) p.member = m;
      else this.addPeer(m);
    }
    this.emit();
  }
  addPeer(member) {
    if (this.closed) return;
    let pc;
    try { pc = this.createPeer({ iceServers: this.ice }); }
    catch (e) { this.fail(voiceError(e)); return; }
    const p = { pc, member, state: 'connecting', queue: Promise.resolve(), candidates: [], retries: 0, closed: false };
    this.peers.set(member.id, p);
    const enqueue = task => {
      p.queue = p.queue.then(() => p.closed || this.closed ? undefined : task()).catch(() => {
        if (!p.closed && !this.closed) { p.state = 'failed'; this.emit(); }
      });
    };
    p.enqueue = enqueue;
    this.stream.getAudioTracks().forEach(t => pc.addTrack(t, this.stream));
    pc.ontrack = e => {
      if (!p.closed && !this.closed) this.onStream(member.id, e.streams[0]);
    };
    pc.onicecandidate = e => {
      if (e.candidate && !p.closed && !this.closed)
        this.transport.send(member, { type: 'candidate', candidate: e.candidate.toJSON() })
          .catch(() => { if (!this.closed) { p.state = 'failed'; this.emit(); } });
    };
    const restart = () => {
      if (p.closed || this.closed || pc.connectionState === 'connected') return;
      if (p.retries++ >= 2) { p.state = 'failed'; this.emit(); return; }
      p.state = 'reconnecting'; this.emit();
      enqueue(async () => {
        if (this.transport.id < member.id) await this.offer(p, true);
        else await this.transport.send(member, { type: 'restart' });
      });
      clearTimeout(p.timer); p.timer = setTimeout(restart, 15000);
    };
    pc.onconnectionstatechange = () => {
      if (p.closed || this.closed) return;
      p.state = pc.connectionState;
      if (p.state === 'connected') { clearTimeout(p.timer); p.retries = 0; }
      if (p.state === 'failed' || p.state === 'disconnected') {
        clearTimeout(p.timer); p.timer = setTimeout(restart, p.state === 'failed' ? 0 : 5000);
      }
      this.emit();
    };
    p.unsubscribe = this.transport.watchSignals(member, message => enqueue(() => this.receive(p, message)),
      e => this.fail(voiceError(e)));
    // Only one endpoint offers, including after ICE restarts: no offer collision.
    if (this.transport.id < member.id) enqueue(() => this.offer(p));
    p.timer = setTimeout(restart, 20000);
  }
  async offer(p, iceRestart = false) {
    if (p.pc.signalingState !== 'stable') return;
    const offer = await p.pc.createOffer({ iceRestart });
    if (p.closed || this.closed) return;
    await p.pc.setLocalDescription(offer);
    if (!p.closed && !this.closed)
      await this.transport.send(p.member, { type: 'description', description: { type: offer.type, sdp: offer.sdp } });
  }
  async receive(p, message) {
    if (!message || p.closed || this.closed) return;
    const pc = p.pc;
    if (message.type === 'restart') {
      if (this.transport.id < p.member.id) await this.offer(p, true);
    } else if (message.type === 'description') {
      const d = message.description;
      if (!d || !['offer', 'answer'].includes(d.type) || typeof d.sdp !== 'string' || d.sdp.length > 16000) return;
      if (d.type === 'offer' && this.transport.id < p.member.id) return;
      if (d.type === 'answer' && pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription(d);
      for (const candidate of p.candidates.splice(0)) await pc.addIceCandidate(candidate);
      if (d.type === 'offer' && !p.closed && !this.closed) {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (!p.closed && !this.closed)
          await this.transport.send(p.member, { type: 'description', description: { type: answer.type, sdp: answer.sdp } });
      }
    } else if (message.type === 'candidate' && message.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(message.candidate);
      else if (p.candidates.length < 100) p.candidates.push(message.candidate);
    }
  }
  setMuted(muted) {
    if (this.status !== 'joined' || this.closed) return;
    this.muted = !!muted;
    this.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    this.emit();
    this.transport.touch({ muted: this.muted }).catch(e => this.fail(voiceError(e)));
  }
  dropPeer(p) {
    p.closed = true;
    clearTimeout(p.timer);
    p.unsubscribe?.();
    p.pc.ontrack = p.pc.onicecandidate = p.pc.onconnectionstatechange = null;
    p.pc.close();
    this.onStream(p.member.id, null);
    this.peers.delete(p.member.id);
  }
  fail(message) { if (this.closed) return; this.leave(); this.status = 'error'; this.emit(message); }
  leave() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat); clearInterval(this.refresh);
    this.unsubs.forEach(fn => fn()); this.unsubs = [];
    for (const p of [...this.peers.values()]) this.dropPeer(p);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    this.stream = null;
    void this.transport.close().catch(() => {});
    this.status = 'idle'; this.muted = true; this.emit();
  }
}
