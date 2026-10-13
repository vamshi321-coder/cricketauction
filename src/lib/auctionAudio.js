// Reuse one audio context throughout a room instead of leaking one per beep.
export function createAuctionAudio(getContext = () => window.AudioContext || window.webkitAudioContext) {
  let context;
  return {
    play(frequency = 440, duration = 0.1) {
      try {
        const AudioContext = getContext();
        if (!AudioContext) return;
        if (!context || context.state === 'closed') context = new AudioContext();
        if (context.state === 'suspended') void context.resume().catch(() => {});
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        gain.gain.setValueAtTime(0.1, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
      } catch { /* Audio availability must never block a bid. */ }
    },
    dispose() {
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      context = null;
    },
  };
}
