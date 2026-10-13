import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { onValue, ref } from 'firebase/database';
import { Mic, MicOff, Headphones, Volume2, VolumeX, PhoneOff, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { rtdb, getServerTime } from '../lib/firebase';
import { VoiceSession, voiceError } from '../lib/voiceSession';
import { canUseVoice, createVoiceTransport, loadVoiceIce, validRoomId } from '../lib/voiceFirebase';
import './RoomVoiceChat.css';

export function VoicePanel({ roomId, user, name, makeSession }) {
  const call = useRef(null);
  const audios = useRef(new Map());
  const outputMuted = useRef(false);
  const volumeValue = useRef(0.8);
  const mutedIds = useRef({});
  // Keep audio elements alive — store them in a ref so they never get GC'd
  const audioStore = useRef([]);
  const [state, setState] = useState({ status: 'idle', muted: true, peers: [], error: '' });
  const [collapsed, setCollapsed] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [volume, setVolume] = useState(80);
  const [blocked, setBlocked] = useState(false);
  const [localMuted, setLocalMuted] = useState({});

  useEffect(() => {
    const stop = () => {
      call.current?.leave(); call.current = null;
      for (const audio of audios.current.values()) {
        try { audio.pause(); audio.srcObject = null; } catch(_) {}
      }
      audios.current.clear();
      audioStore.current = [];
    };
    window.addEventListener('pagehide', stop);
    // Also stop on visibility change to background (mobile tab switch)
    const onVis = () => { if (document.visibilityState === 'hidden') { /* keep alive — don't stop */ } };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, []);

  // Fix audio dropout: re-attempt play on any user interaction
  useEffect(() => {
    const tryResume = () => {
      let anyBlocked = false;
      for (const audio of audios.current.values()) {
        if (audio.paused && audio.srcObject) {
          audio.play().catch(() => { anyBlocked = true; });
        }
      }
      if (!anyBlocked) setBlocked(false);
    };
    document.addEventListener('click', tryResume, { passive: true });
    document.addEventListener('touchstart', tryResume, { passive: true });
    return () => {
      document.removeEventListener('click', tryResume);
      document.removeEventListener('touchstart', tryResume);
    };
  }, []);

  // Periodic audio health-check — every 8 seconds, resume any stalled streams
  useEffect(() => {
    const interval = setInterval(() => {
      let anyBlocked = false;
      for (const audio of audios.current.values()) {
        if (audio.srcObject && audio.paused && !outputMuted.current) {
          audio.play().catch(() => { anyBlocked = true; });
        }
        // If stream ended (peer disconnected briefly), do nothing — session will call onStream again
      }
      if (anyBlocked) setBlocked(true);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const join = async () => {
    if (call.current && !call.current.closed) return;
    setBlocked(false); setCollapsed(false); setLocalMuted({}); mutedIds.current = {};
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setState(s => ({ ...s, status: 'error', error: 'Open in Chrome or Safari using HTTPS (or localhost) to use your microphone.' }));
      return;
    }
    try {
      const config = {
        transport: createVoiceTransport(roomId, user, name),
        getMedia: () => navigator.mediaDevices.getUserMedia({ video: false, audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        }}),
        createPeer: options => new RTCPeerConnection(options),
        getIce: () => loadVoiceIce(user, roomId),
        now: getServerTime,
        onChange: next => setState(next),
        onStream: (id, stream) => {
          // Remove old audio for this peer
          const old = audios.current.get(id);
          if (old) {
            try { old.pause(); old.srcObject = null; } catch(_) {}
            audios.current.delete(id);
            audioStore.current = audioStore.current.filter(a => a !== old);
          }
          if (!stream) return;

          const audio = new Audio();
          audio.autoplay = true;
          audio.setAttribute('playsinline', '');
          audio.setAttribute('webkit-playsinline', '');
          audio.srcObject = stream;
          audio.muted = outputMuted.current || !!mutedIds.current[id];
          audio.volume = volumeValue.current;

          // Keep audio alive in store so GC can't collect it
          audioStore.current.push(audio);
          audios.current.set(id, audio);

          // Try playing — retry a few times on mobile
          const tryPlay = (attempts = 0) => {
            audio.play().then(() => {
              setBlocked(false);
            }).catch(err => {
              if (attempts < 3) {
                setTimeout(() => tryPlay(attempts + 1), 500 * (attempts + 1));
              } else {
                setBlocked(true);
              }
            });
          };
          tryPlay();
        },
      };
      const session = makeSession ? makeSession(config) : new VoiceSession(config);
      call.current = session;
      await session.join();
    } catch (e) {
      setState(s => ({ ...s, status: 'error', error: voiceError(e) }));
    }
  };

  const leave = () => {
    call.current?.leave(); call.current = null; setBlocked(false);
  };

  const toggleOutput = () => {
    const next = !deafened; outputMuted.current = next; setDeafened(next);
    for (const [id, audio] of audios.current) {
      audio.muted = next || !!localMuted[id];
      if (!audio.muted) audio.play().catch(() => setBlocked(true));
    }
  };

  const toggleFriend = id => {
    const next = !localMuted[id];
    const newMap = { ...localMuted, [id]: next };
    mutedIds.current = newMap; setLocalMuted(newMap);
    const audio = audios.current.get(id);
    if (audio) {
      audio.muted = deafened || next;
      if (!audio.muted) audio.play().catch(() => setBlocked(true));
    }
  };

  const enableAudio = async () => {
    const results = await Promise.allSettled([...audios.current.values()].map(a => a.play()));
    setBlocked(results.some(r => r.status === 'rejected'));
  };

  const joined = state.status === 'joined';
  const joining = state.status === 'joining';
  const connectedCount = state.peers.filter(p => p.status === 'connected').length;

  return (
    <aside className={`room-voice${collapsed ? ' is-collapsed' : ''}`} aria-label="Room voice chat">
      {/* Top row — compact, always visible */}
      <div className="room-voice-top">
        <button
          className="room-voice-heading"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls="room-voice-body"
        >
          <Headphones size={16} />
          <span>
            Voice
            <small>
              {joined
                ? connectedCount > 0 ? `${connectedCount} connected` : state.muted ? 'Mic muted' : 'Mic on'
                : joining ? 'Joining…' : 'Optional'}
            </small>
          </span>
          {joined && connectedCount > 0 && (
            <span className="flex items-center gap-0.5 text-[8px] font-black text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
              <Users size={8}/>{connectedCount}
            </span>
          )}
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        {/* Mic toggle — always visible when joined */}
        {joined && (
          <button
            className={state.muted ? '' : 'voice-live'}
            onClick={() => call.current?.setMuted(!state.muted)}
            aria-label={state.muted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={!state.muted}
          >
            {state.muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
      </div>

      <div id="room-voice-body" hidden={collapsed}>
        <p className="voice-hint">Talk with friends in this room. Joins with mic muted.</p>

        <div role="status" aria-live="polite" className="voice-status">
          {state.error || (
            joined
              ? state.peers.length
                ? `${connectedCount} friend(s) connected`
                : 'Waiting for friends to join voice…'
              : joining
              ? 'Connecting… allow microphone when asked.'
              : 'Voice is off. Tap join to connect.'
          )}
        </div>

        {!joined && !joining && (
          <button className="voice-join" onClick={join}>
            <Headphones size={16} /> Join voice
          </button>
        )}
        {joining && <button onClick={leave}>Cancel</button>}

        {joined && (
          <>
            <div className="voice-actions">
              <button onClick={toggleOutput} aria-pressed={deafened}>
                {deafened ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {deafened ? 'Hear friends' : 'Mute friends'}
              </button>
              <button onClick={leave}><PhoneOff size={16} />Leave</button>
            </div>

            <label className="voice-volume">
              Volume
              <input
                aria-label="Friends volume"
                type="range" min="0" max="100" value={volume}
                onChange={e => {
                  const v = Number(e.target.value); setVolume(v);
                  volumeValue.current = v / 100;
                  audios.current.forEach(a => { a.volume = v / 100; });
                }}
              />
            </label>

            <ul className="voice-members">
              {state.peers.map(p => (
                <li key={p.id}>
                  <span>
                    <strong>{p.name || 'Manager'}</strong>
                    <small>
                      {p.status === 'connected'
                        ? p.muted ? 'Mic muted' : 'Speaking'
                        : p.status === 'failed' ? 'Could not connect'
                        : 'Connecting…'}
                    </small>
                  </span>
                  <button
                    onClick={() => toggleFriend(p.id)}
                    aria-label={`${localMuted[p.id] ? 'Unmute' : 'Mute'} ${p.name || 'Manager'}`}
                    aria-pressed={!!localMuted[p.id]}
                  >
                    {localMuted[p.id] ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                </li>
              ))}
            </ul>

            {state.peers.some(p => p.status === 'failed') && (
              <>
                <p className="voice-hint">Connection failed. Try another network.</p>
                <button onClick={() => { leave(); void join(); }}>Retry</button>
              </>
            )}
          </>
        )}

        {blocked && (
          <button className="voice-join" onClick={enableAudio}>
            👆 Tap to hear friends
          </button>
        )}
        <p className="voice-tip">Use headphones to reduce echo.</p>
      </div>
    </aside>
  );
}

function RoomVoiceGate({ roomId, user }) {
  const [room, setRoom] = useState(null);
  useEffect(() => onValue(ref(rtdb, `auctions/${roomId}/room`), s => setRoom(s.val()), () => setRoom(null)), [roomId]);
  if (!canUseVoice(room, user.uid)) return null;
  const player = room.players?.find(p => p.id === user.uid);
  return <VoicePanel roomId={roomId} user={user} name={player?.name || user.displayName || 'Manager'} />;
}

export default function RoomVoiceChat() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const match = pathname.match(/^\/(?:lobby|auction|summary)\/([^/]+)\/?$/);
  const roomId = match?.[1];
  if (!user?.uid || !validRoomId(roomId)) return null;
  return <RoomVoiceGate key={`${roomId}:${user.uid}`} roomId={roomId} user={user} />;
}
