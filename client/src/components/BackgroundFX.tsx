import { useEffect, useRef } from "react";
import { loadPerfMode, systemPrefersReducedMotion } from "../lib/settings";

/**
 * Cinematic ambient background — a single full-screen <canvas> with a subtle
 * drifting particle field + faint perspective grid. One canvas, no DOM nodes
 * per particle, capped particle counts, and it pauses entirely when the tab is
 * hidden or PERFORMANCE MODE / reduced-motion is active. Purely cosmetic: it
 * never touches the network or Redis.
 */
export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const perf = loadPerfMode();
    const reduced = systemPrefersReducedMotion();
    if (perf || reduced) return; // no animation at all in these modes

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let raf = 0;
    let running = true;

    const isMobile = width < 768;
    const PARTICLE_COUNT = isMobile ? 22 : 44;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.6 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -0.05 - Math.random() * 0.22,
      alpha: 0.12 + Math.random() * 0.35,
      hue: Math.random() < 0.5 ? 199 : 265, // cyan or violet
    }));

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    const onVisibility = () => {
      running = document.visibilityState === "visible";
      if (running) raf = requestAnimationFrame(draw);
      else cancelAnimationFrame(raf);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Faint radial vignette lighting from the top.
      const glow = ctx.createRadialGradient(
        width / 2,
        -height * 0.25,
        0,
        width / 2,
        -height * 0.25,
        Math.max(width, height) * 0.9,
      );
      glow.addColorStop(0, "rgba(37, 99, 235, 0.10)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Faint perspective grid on the lower half.
      ctx.strokeStyle = "rgba(56, 189, 248, 0.045)";
      ctx.lineWidth = 1;
      const horizon = height * 0.72;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(width / 2 + i * (width / 9), horizon);
        ctx.lineTo(width / 2 + i * (width / 2.4), height);
        ctx.stroke();
      }
      for (let j = 1; j <= 5; j++) {
        ctx.beginPath();
        const y = horizon + ((height - horizon) / 5) * j;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Drifting particles.
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${p.alpha})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="bg-fx"
    />
  );
}
