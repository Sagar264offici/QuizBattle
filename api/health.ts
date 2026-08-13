const REDIS_URL = "https://casual-ray-186045.upstash.io";
const REDIS_TOKEN = "gQAAAAAAAta9AAIgcDI3NmExNGJjOTA2YTU0MDk4YTc5OGUzMWYyMjI4N2U5Yg";

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
    const data = await response.json();
    res.status(200).json({ ok: true, redis: data.result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
