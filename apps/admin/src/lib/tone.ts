// A short two-note tone for a new SOS alert, made with Web Audio (no sound file). Browsers only
// let a page play sound after the person has interacted with it, so primeAudio() runs on the
// first click or key press in the panel; until then the alert is visual only.
const NOTES = [{ hz: 880, at: 0 }, { hz: 660, at: 0.22 }];
const NOTE_SECONDS = 0.16;
const VOLUME = 0.18;

let ctx: AudioContext | null = null;

/** Call from a user gesture: unlocks sound for the rest of the visit. */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* no Web Audio: alerts stay visual */ }
}

export const audioReady = () => ctx?.state === "running";

export function playSosTone() {
  if (!ctx || ctx.state !== "running") return;
  const start = ctx.currentTime + 0.02;
  for (const n of NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = n.hz;
    gain.gain.setValueAtTime(0, start + n.at);
    gain.gain.linearRampToValueAtTime(VOLUME, start + n.at + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + n.at + NOTE_SECONDS);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + n.at);
    osc.stop(start + n.at + NOTE_SECONDS + 0.02);
  }
}
