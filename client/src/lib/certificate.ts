/**
 * Certificate rendering — stamps a student's name, position (1st / 2nd / 3rd)
 * and the date onto the official college certificate template
 * (CertificateFirst.png → /certificates/certificate-template.png) entirely in
 * the browser on a <canvas> (no server round-trip, no extra deps).
 * Exports via toDataURL("image/png").
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
  /** Accepted for API compatibility; the official template has no event-name field. */
  eventName?: string;
  date?: Date;
}

// Official template is 1448 × 1086 (CertificateFirst.png).
const W = 1448;
const H = 1086;
const TEMPLATE_URL = "/certificates/certificate-template.png";

// Ink colors sampled from the template.
const BG = "#faf6f1"; // parchment background (250, 246, 241)
const NAVY = "#2a304b"; // dark navy name/body ink (42, 48, 75)
const GOLD = "#b67f24"; // gold/bronze of "FIRST POSITION" (≈182, 127, 36)

const SERIF = '"Georgia", "Times New Roman", serif';

const RANK_WORDS = ["", "FIRST POSITION", "SECOND POSITION", "THIRD POSITION"];
const RANK_SHORT = ["", "1st", "2nd", "3rd"];

// ── Template text regions (pixels on the 1448×1086 image) ────────────────
// Name blank line: y 660–661, x 351–1121 → name centered at x 736.
const NAME_CENTER_X = 736;
const NAME_BASELINE_Y = 652;

// "has secured FIRST POSITION" line: y ≈688–709, gold text x 620–931,
// "has secured" navy x 528–612. The whole line is centered at x ≈736.
const POSITION_LINE_CENTER_X = 736;
const POSITION_LINE_BASELINE_Y = 708;

// Date field: "DATE:" label then a blank line at y ≈1020–1024, x ≈560–890.
const DATE_CENTER_X = 725;
const DATE_BASELINE_Y = 1016;

let templatePromise: Promise<HTMLImageElement> | null = null;

/** Load (and cache) the official certificate template image. */
export function loadTemplate(): Promise<HTMLImageElement> {
  if (!templatePromise) {
    templatePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load the certificate template"));
      img.src = TEMPLATE_URL;
    });
  }
  return templatePromise;
}

/** Format a millisecond duration (e.g. "12.4s", "1m 24s"). */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}m ${s}s`;
}

/** Draw several text segments (with different fonts/colors) as one centered line. */
function drawMixedCentered(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  segments: Array<{ text: string; font: string; color: string }>,
) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const widths = segments.map((s) => {
    ctx.font = s.font;
    return ctx.measureText(s.text).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let x = centerX - total / 2;
  segments.forEach((s, i) => {
    ctx.font = s.font;
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, x, baselineY);
    x += widths[i];
  });
}

/** Stamp the winner's name centered on the blank name line of the template. */
function drawName(ctx: CanvasRenderingContext2D, name: string) {
  // Auto-fit long names inside the blank line (x 351–1121 → max ~720px).
  const maxWidth = 720;
  let fontPx = 44;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const fits = (px: number) => {
    ctx.font = `700 ${px}px ${SERIF}`;
    return ctx.measureText(name).width <= maxWidth;
  };
  while (fontPx > 24 && !fits(fontPx)) fontPx -= 2;
  ctx.font = `700 ${fontPx}px ${SERIF}`;
  ctx.fillStyle = NAVY;
  ctx.fillText(name, NAME_CENTER_X, NAME_BASELINE_Y);
}

/** Stamp "has secured <POSITION>" — navy text + gold position word, centered. */
function drawPositionLine(ctx: CanvasRenderingContext2D, rank: 1 | 2 | 3) {
  const word = RANK_WORDS[rank] ?? RANK_WORDS[1];
  drawMixedCentered(ctx, POSITION_LINE_CENTER_X, POSITION_LINE_BASELINE_Y, [
    { text: "has secured ", font: `500 15px ${SERIF}`, color: NAVY },
    { text: word, font: `700 30px ${SERIF}`, color: GOLD },
  ]);
}

/** Stamp the award date onto the template's blank DATE line. */
function drawDate(ctx: CanvasRenderingContext2D, date?: Date) {
  const label = (date ?? new Date()).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 18px ${SERIF}`;
  ctx.fillStyle = NAVY;
  ctx.fillText(label, DATE_CENTER_X, DATE_BASELINE_Y);
}

/** Draw the completed certificate onto an existing 2D context. */
export async function drawCertificate(
  ctx: CanvasRenderingContext2D,
  student: CertificateStudent,
  opts: CertificateOptions = {},
) {
  const img = await loadTemplate();
  ctx.drawImage(img, 0, 0, W, H);

  // Erase the template's pre-printed "has secured FIRST POSITION" line so the
  // correct position can be stamped for this student (covers x 500–960,
  // y 685–712 — well clear of the left badge / right trophy art).
  ctx.fillStyle = BG;
  ctx.fillRect(500, 685, 462, 28);

  drawName(ctx, student.name);
  drawPositionLine(ctx, student.rank);
  drawDate(ctx, opts.date);
}

/** Draw the certificate and return its PNG data URL. */
export async function certificateDataURL(
  student: CertificateStudent,
  opts: CertificateOptions = {},
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  await drawCertificate(ctx, student, opts);
  return canvas.toDataURL("image/png");
}

/** Build a full certificate PNG and trigger a browser download. */
export async function downloadCertificatePNG(
  student: CertificateStudent,
  opts: CertificateOptions = {},
) {
  const dataUrl = await certificateDataURL(student, opts);
  const a = document.createElement("a");
  const safe = student.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "student";
  a.href = dataUrl;
  a.download = `certificate_${RANK_SHORT[student.rank] ?? student.rank}_${safe}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
