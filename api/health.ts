import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "https://casual-ray-186045.upstash.io",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "gQAAAAAAAta9AAIgcDI3NmExNGJjOTA2YTU0MDk4YTc5OGUzMWYyMjI4N2U5Yg",
});

export default async function handler(_req: any, res: any) {
  try {
    const pong = await redis.ping();
    res.status(200).json({ ok: true, redis: pong });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
