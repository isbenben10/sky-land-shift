// Lightweight WebAudio sound effects — no assets needed.
let ctx: AudioContext | null = null;

const getCtx = () => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
};

type Tone = {
  freq: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
};

const playTone = ({ freq, freqEnd, duration, type = "square", volume = 0.15 }: Tone, delay = 0) => {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
};

export const sfx = {
  resume: () => getCtx()?.resume(),
  jump: () => playTone({ freq: 440, freqEnd: 760, duration: 0.14, type: "square", volume: 0.12 }),
  fruit: () => {
    playTone({ freq: 660, duration: 0.08, type: "triangle", volume: 0.18 });
    playTone({ freq: 990, duration: 0.1, type: "triangle", volume: 0.15 }, 0.06);
  },
  transform: () => {
    playTone({ freq: 220, freqEnd: 880, duration: 0.35, type: "sawtooth", volume: 0.18 });
    playTone({ freq: 330, freqEnd: 1320, duration: 0.4, type: "triangle", volume: 0.12 }, 0.05);
  },
  reverse: () => {
    playTone({ freq: 880, freqEnd: 220, duration: 0.35, type: "sawtooth", volume: 0.18 });
  },
  gameover: () => {
    playTone({ freq: 330, freqEnd: 110, duration: 0.5, type: "square", volume: 0.2 });
    playTone({ freq: 220, freqEnd: 80, duration: 0.6, type: "triangle", volume: 0.15 }, 0.1);
  },
};
