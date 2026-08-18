/**
 * QuizBattle UI sound effects — a tiny WebAudio synth, no audio files.
 * OFF BY DEFAULT. The user opts in via the sound toggle; nothing autoplays.
 * Every blip is short (≤180ms) and quiet. Respects reduced-motion users by
 * simply not being enabled until the user turns it on.
 */

import { loadSoundEnabled, saveSoundEnabled } from "./settings";

let ctx: AudioContext | null = null;
let enabled = loadSoundEnabled();

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  saveSoundEnabled(on);
  if (!on && ctx) {
    // Suspend instead of closing so a re-enable is instant and gesture-safe.
    ctx.suspend().catch(() => {});
  }
}

/** Lazily create/resume the AudioContext — must follow a user gesture. */
function ensureCtx(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, durationMs = 120, type: OscillatorType = "sine", volume = 0.06) {
  const ac = ensureCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + durationMs / 1000);
  } catch {}
}

function sweep(from: number, to: number, durationMs = 160, volume = 0.06) {
  const ac = ensureCtx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ac.currentTime + durationMs / 1000);
    gain.gain.setValueAtTime(volume, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + durationMs / 1000);
  } catch {}
}

export const sfx = {
  /** Question is about to start — quick two-tone rise. */
  questionStart() {
    sweep(420, 880, 180, 0.07);
  },
  /** Final seconds warning — single short beep. */
  timerWarning() {
    blip(880, 90, "square", 0.04);
  },
  /** Answer selected — soft confirm tick. */
  answerSelect() {
    blip(520, 70, "triangle", 0.05);
  },
  /** Answer locked in — firmer two-note confirm. */
  answerLock() {
    blip(660, 90, "triangle", 0.06);
    setTimeout(() => blip(990, 120, "triangle", 0.06), 70);
  },
  /** Correct answer reveal — bright rising chime. */
  correct() {
    sweep(520, 1040, 200, 0.07);
    setTimeout(() => blip(1318, 160, "sine", 0.05), 90);
  },
  /** Wrong answer reveal — low flat note. */
  wrong() {
    blip(220, 180, "sawtooth", 0.04);
  },
  /** Round / question transition flourish. */
  transition() {
    sweep(330, 660, 140, 0.05);
  },
  /** Participant joined — subtle ping. */
  participantJoined() {
    blip(740, 90, "sine", 0.04);
  },
  /** Quiz finished — small victory arpeggio. */
  finished() {
    sweep(440, 880, 180, 0.07);
    setTimeout(() => sweep(660, 1320, 200, 0.06), 140);
  },
};
