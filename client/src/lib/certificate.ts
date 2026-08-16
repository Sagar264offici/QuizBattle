/**
 * Certificate rendering — draws a beautiful, print-ready PNG certificate on a
 * <canvas> entirely in the browser (no server round-trip, no extra deps) for
 * the TOP 3 students of a finished quiz. Exports via toDataURL("image/png").
 */

export interface CertificateStudent {
  name: string;
  club: "STACK_PUSH" | "IT_INNOVATORS" | string;
  score: number;
  correctCount: number;
  attemptCount: number;
  totalResponseMs: number;
  rank: 1 | 2 | 3;
}

export interface CertificateOptions {
  mode?: "live" | "test";
  /** Shown on the certificate as the event name (defaults to the quiz title). */
  eventName?: string;
  date?: Date;
}

const W = 1600;
const H = 1131;

const GOLD = "#f5c542";
const GOLD_LIGHT = "#ffe9a3";
const GOLD_DIM = "#b98a2e";
const INK = "#eaf0fb";
const MUTED = "#9fb0cc";

const SERIF = '"Georgia", "Times New Roman", serif';
const SANS = '"Arial", "Helvetica Neue", sans-serif';

/** Format a millisecond duration for the certificate (e.g. "12.4s", "1m 24s"). */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}m ${s}s`;
}

const RANK_LABEL = ["", "1st", "2nd", "3rd"];
const RANK_COLOR = ["", "#fbbf24", "#cbd5e1", "#d48c54"];

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMedal(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, rank: number) {
  const color = RANK_COLOR[rank] || GOLD;
  // Ribbons
  ctx.fillStyle = rank === 1 ? "#3b82f6" : rank === 2 ? "#64748b" : "#b45309";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy - size * 0.28);
  ctx.lineTo(cx - size * 0.16, cy - size * 0.02);
  ctx.lineTo(cx - size * 0.05, cy - size * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.42, cy - size * 0.28);
  ctx.lineTo(cx + size * 0.16, cy - size * 0.02);
  ctx.lineTo(cx + size * 0.05, cy - size * 0.28);
  ctx.closePath();
  ctx.fill();

  // Medal disc
  const grad = ctx.createRadialGradient(cx - size * 0.1, cy - size * 0.12, size * 0.05, cx, cy, size * 0.5);
  grad.addColorStop(0, "#fff3cf");
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, "#8a6116");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = size * 0.045;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  // Rank number
  ctx.fillStyle = "#3a2a05";
  ctx.font = `900 ${Math.round(size * 0.42)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(rank), cx, cy + size * 0.02);
}

/** Draw the certificate and return its PNG data URL. */
export function certificateDataURL(
  student: CertificateStudent,
  opts: CertificateOptions = {},
): string {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");

  drawCertificate(ctx, student, opts);
  return canvas.toDataURL("image/png");
}

export function drawCertificate(
  ctx: CanvasRenderingContext2D,
  student: CertificateStudent,
  opts: CertificateOptions = {},
) {
  const eventName =
    opts.eventName ??
    (opts.mode === "test"
      ? "IT Club Championship — TEST MODE · 60 Questions"
      : "IT Club Championship — Technical Battle");
  const date = (opts.date ?? new Date()).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const clubLabel = student.club === "STACK_PUSH" ? "Stack.push" : "IT Innovators";
  const clubColor = student.club === "STACK_PUSH" ? "#60a5fa" : "#34d399";

  // ── Background ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b1120");
  bg.addColorStop(0.5, "#131d36");
  bg.addColorStop(1, "#0b1120");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Radial glow behind the name
  const glow = ctx.createRadialGradient(W / 2, H * 0.44, 60, W / 2, H * 0.44, W * 0.55);
  glow.addColorStop(0, "rgba(245, 197, 66, 0.16)");
  glow.addColorStop(1, "rgba(245, 197, 66, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Outer + inner gold frames ──
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 4;
  roundRect(ctx, 42, 42, W - 84, H - 84, 28);
  ctx.stroke();

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  roundRect(ctx, 60, 60, W - 120, H - 120, 22);
  ctx.stroke();

  // Corner ornaments
  const corner = (x: number, y: number, flipX: number, flipY: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flipX, flipY);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 88);
    ctx.lineTo(0, 0);
    ctx.lineTo(88, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 56);
    ctx.lineTo(0, 0);
    ctx.lineTo(56, 0);
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  };
  corner(78, 78, 1, 1);
  corner(W - 78, 78, -1, 1);
  corner(78, H - 78, 1, -1);
  corner(W - 78, H - 78, -1, -1);

  // ── Medal ──
  drawMedal(ctx, W / 2, 205, 150, student.rank);

  // ── Header ──
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = `700 40px ${SANS}`;
  ctx.fillText("C E R T I F I C A T E   O F   E X C E L L E N C E", W / 2, 330);
  ctx.fillStyle = MUTED;
  ctx.font = `500 28px ${SANS}`;
  ctx.fillText(eventName.toUpperCase(), W / 2, 382);

  // ── Presented to ──
  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText("THIS CERTIFICATE IS PROUDLY PRESENTED TO", W / 2, 470);

  ctx.fillStyle = GOLD_LIGHT;
  ctx.font = `800 96px ${SERIF}`;
  ctx.fillText(student.name, W / 2, 600);

  // Underline flourish
  ctx.strokeStyle = GOLD_DIM;
  ctx.lineWidth = 2;
  const lineW = Math.min(760, 240 + student.name.length * 34);
  ctx.beginPath();
  ctx.moveTo(W / 2 - lineW / 2, 640);
  ctx.lineTo(W / 2 - lineW / 6, 640);
  ctx.moveTo(W / 2 + lineW / 6, 640);
  ctx.lineTo(W / 2 + lineW / 2, 640);
  ctx.stroke();

  // Club badge
  ctx.fillStyle = clubColor;
  ctx.font = `700 32px ${SANS}`;
  ctx.fillText(`${clubLabel === "Stack.push" ? "⚡" : "🚀"} ${clubLabel}`, W / 2, 700);

  // ── Stats row ──
  const stats: Array<{ label: string; value: string }> = [
    { label: "RANK", value: RANK_LABEL[student.rank] ?? String(student.rank) },
    { label: "FINAL SCORE", value: `${student.score} pts` },
    { label: "CORRECT ANSWERS", value: `${student.correctCount} / ${Math.max(student.attemptCount, student.correctCount)}` },
    { label: "TOTAL ANSWER TIME", value: formatDuration(student.totalResponseMs) },
  ];
  const boxW = 300;
  const gap = 36;
  const totalW = stats.length * boxW + (stats.length - 1) * gap;
  let bx = (W - totalW) / 2;
  const by = 760;
  const bh = 150;
  for (const s of stats) {
    ctx.fillStyle = "rgba(245, 197, 66, 0.07)";
    roundRect(ctx, bx, by, boxW, bh, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(245, 197, 66, 0.35)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, boxW, bh, 16);
    ctx.stroke();

    ctx.fillStyle = MUTED;
    ctx.font = `700 22px ${SANS}`;
    ctx.fillText(s.label, bx + boxW / 2, by + 44);
    ctx.fillStyle = GOLD_LIGHT;
    ctx.font = `800 40px ${SANS}`;
    ctx.fillText(s.value, bx + boxW / 2, by + 108);
    bx += boxW + gap;
  }

  // ── Date + signature ──
  ctx.fillStyle = MUTED;
  ctx.font = `500 26px ${SANS}`;
  ctx.textAlign = "left";
  ctx.fillText(`Date: ${date}`, 130, H - 120);
  ctx.textAlign = "right";
  ctx.fillText("QuizMaster · IT Club", W - 130, H - 120);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - 340, H - 148);
  ctx.lineTo(W - 130, H - 148);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(159, 176, 204, 0.55)";
  ctx.font = `500 22px ${SANS}`;
  ctx.fillText("Awarded for speed, accuracy & knowledge", W / 2, H - 70);
}

/** Build a full certificate PNG and trigger a browser download. */
export function downloadCertificatePNG(
  student: CertificateStudent,
  opts: CertificateOptions = {},
) {
  const dataUrl = certificateDataURL(student, opts);
  const a = document.createElement("a");
  const safe = student.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "student";
  a.href = dataUrl;
  a.download = `certificate_${RANK_LABEL[student.rank] ?? student.rank}_${safe}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
