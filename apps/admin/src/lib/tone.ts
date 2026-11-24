// Alert sounds, made with Web Audio (no sound files): a sharp two-note tone for a new SOS and a soft
// rising chime for everything else. Browsers only let a page play sound after the person has
// interacted with it, so primeAudio() runs on the first click or key press in the panel; until
// then alerts are visual only.
type Note = { hz: number; at: number };
interface Sound { notes: Note[]; seconds: number; volume: number; wave: OscillatorType }

const SOS: Sound = { notes: [{ hz: 880, at: 0 }, { hz: 660, at: 0.22 }], seconds: 0.16, volume: 0.18, wave: "sine" };
const CHIME: Sound = { notes: [{ hz: 660, at: 0 }, { hz: 990, at: 0.12 }], seconds: 0.28, volume: 0.07, wave: "triangle" };

let ctx: AudioContext | null = null;

/** Call from a user gesture: unlocks sound for the rest of the visit. */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* no Web Audio: alerts stay visual */ }
}

export const audioReady = () => ctx?.state === "running";

function play(sound: Sound) {
  if (!ctx || ctx.state !== "running") return;
  const start = ctx.currentTime + 0.02;
  for (const n of sound.notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = sound.wave;
    osc.frequency.value = n.hz;
    gain.gain.setValueAtTime(0, start + n.at);
    gain.gain.linearRampToValueAtTime(sound.volume, start + n.at + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + n.at + sound.seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + n.at);
    osc.stop(start + n.at + sound.seconds + 0.02);
  }
}

export const playSosTone = () => play(SOS);
/** New ticket, reply, callback, partner, licence or parcel alert. */
export const playChime = () => play(CHIME);
