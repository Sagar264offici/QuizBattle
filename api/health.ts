const REDIS_URL = "https://valued-bluebird-145233.upstash.io";
const REDIS_TOKEN = "gQAAAAAAAjdRAAIgcDIwYTE1NmM1Y2I2NzM0MDQ3YjFiZGQ0ZmM3NWZiMWQ0YQ";

// Upstash answers HTTP 400 with this error body once the free-tier monthly
// request quota (500k commands) is exhausted — a billing condition, not an
// outage. Report it distinctly so the host sees the actual remedy.
function isQuotaError(text: string): boolean {
  return /max (requests?|daily request) limit exceeded/i.test(text);
}

export default async function handler(_req: any, res: any) {
  try {
    const response = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["PING"]),
    });
    const text = await response.text();
    if (!response.ok || isQuotaError(text)) {
      return res.status(503).json({
        ok: false,
        redis: "ERROR",
        code: isQuotaError(text) ? "REDIS_QUOTA_EXCEEDED" : "REDIS_UNAVAILABLE",
        error: isQuotaError(text)
          ? "Upstash Redis request quota exhausted (free-tier 500k/month limit reached). Add a payment method to auto-upgrade the database, or create a new database."
          : text,
      });
    }
    const data = JSON.parse(text);
    res.status(200).json({ ok: true, redis: data.result });
  } catch (err: any) {
    res.status(500).json({ ok: false, redis: "ERROR", error: err.message });
  }
}
