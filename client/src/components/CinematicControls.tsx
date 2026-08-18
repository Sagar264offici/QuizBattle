import { useEffect, useState } from "react";
import { loadPerfMode, savePerfMode, systemPrefersReducedMotion } from "../lib/settings";
import { isSoundEnabled, setSoundEnabled } from "../lib/sound";

/**
 * Floating toggles: SOUND (off by default) and PERFORMANCE MODE (reduced
 * effects). Purely client-side settings — no server calls, no Redis.
 */
export default function CinematicControls({ compact = false }: { compact?: boolean }) {
  const [sound, setSound] = useState(isSoundEnabled());
  const [perf, setPerf] = useState(loadPerfMode());
  const [reduced] = useState(systemPrefersReducedMotion());

  // Reflect PERFORMANCE MODE on <body> so CSS can strip heavy effects.
  useEffect(() => {
    document.body.classList.toggle("perf-mode", perf || reduced);
  }, [perf, reduced]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
  };

  const togglePerf = () => {
    const next = !perf;
    setPerf(next);
    savePerfMode(next);
  };

  return (
    <div className={`cinematic-controls ${compact ? "compact" : ""}`} aria-label="Display settings">
      <button
        type="button"
        className={`cc-btn ${sound ? "on" : ""}`}
        onClick={toggleSound}
        title={sound ? "Sound effects on — click to mute" : "Sound effects off — click to enable"}
        aria-pressed={sound}
      >
        {sound ? "🔊" : "🔇"}
      </button>
      <button
        type="button"
        className={`cc-btn ${perf || reduced ? "on" : ""}`}
        onClick={togglePerf}
        title={perf ? "Performance mode on — full effects disabled" : "Performance mode off — cinematic effects enabled"}
        aria-pressed={perf}
      >
        {perf || reduced ? "⚡" : "✨"}
      </button>
    </div>
  );
}
