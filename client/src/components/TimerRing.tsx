import { useEffect, useRef, useState } from "react";
import { sfx } from "../lib/sound";

interface TimerRingProps {
  remaining: number; // whole seconds remaining
  total: number; // total question duration in seconds
  /** Called once when crossing the ~25% warning threshold. */
  onWarning?: () => void;
  size?: number;
  label?: string;
}

/**
 * Cinematic circular countdown. Pure client-side: renders from the server's
 * authoritative `questionEndsAt` timestamp and ticks locally — it never polls
 * and never touches Redis. Visual states:
 *   NORMAL   (cool)        → cyan ring
 *   WARNING  (≤25% left)   → amber pulse
 *   CRITICAL (≤5s left)    → red pulse + edge glow
 */
export default function TimerRing({ remaining, total, onWarning, size = 130, label }: TimerRingProps) {
  const warnedRef = useRef(false);
  const [flash, setFlash] = useState(0);

  const pct = total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0;
  const critical = remaining <= 5;
  const warning = remaining <= Math.max(4, Math.round(total * 0.25));

  // Warning threshold crossed → one subtle beep (sound is opt-in, off by default).
  useEffect(() => {
    if (warning && !warnedRef.current && remaining > 0) {
      warnedRef.current = true;
      onWarning?.();
      sfx.timerWarning();
    }
    if (!warning) warnedRef.current = false;
  }, [warning, remaining, onWarning]);

  // Critical second tick — tiny visual pulse.
  useEffect(() => {
    if (critical && remaining > 0) setFlash((f) => f + 1);
  }, [remaining, critical]);

  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const dash = (pct / 100) * CIRC;

  const stateClass = critical ? "timer-ring critical" : warning ? "timer-ring warning" : "timer-ring normal";

  return (
    <div className={`timer-ring-wrap ${stateClass}`} style={{ width: size, height: size }} role="timer" aria-label={`${remaining} seconds remaining`}>
      <svg viewBox="0 0 130 130" width={size} height={size} aria-hidden="true">
        <circle cx="65" cy="65" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          className="timer-ring-arc"
          cx="65"
          cy="65"
          r={R}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC - dash}`}
          transform="rotate(-90 65 65)"
        />
      </svg>
      <div className="timer-ring-center" key={flash}>
        <div className="timer-ring-seconds">{remaining}</div>
        {label && <div className="timer-ring-label">{label}</div>}
      </div>
    </div>
  );
}
