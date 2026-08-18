/**
 * QuizBattle client settings — persisted locally, never sent to the server.
 *  - perfMode: "PERFORMANCE MODE" — fewer particles, simpler shadows, reduced
 *    background animation. Quiz functionality is identical.
 *  - soundEnabled: UI sound effects, OFF by default. Users opt in.
 *  - reducedMotion: derived from the OS preference + perfMode override.
 */

const PERF_KEY = "quizbattle-perf-mode";
const SOUND_KEY = "quizbattle-sound";

export function loadPerfMode(): boolean {
  try {
    return localStorage.getItem(PERF_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePerfMode(on: boolean) {
  try {
    localStorage.setItem(PERF_KEY, on ? "1" : "0");
  } catch {}
}

export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {}
}

/** True when the OS asks for reduced motion. */
export function systemPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
