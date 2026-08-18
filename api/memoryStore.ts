/**
 * In-memory Redis-compatible store.
 *
 * Implements exactly the command surface the QuizBattle API uses (GET/SET/INCR/
 * INCRBY/DEL/EXPIRE/HSET/HGET/HDEL/HGETALL/SADD/SREM/SMEMBERS/SISMEMBER/SCARD/
 * FLUSHDB/PING/EVAL + pipeline batching) so the whole quiz can run from one
 * host process with NO external database, NO request quota, and NO network
 * round-trips — used for the zero-cost event setup (LAN or a free public
 * tunnel such as Cloudflare Quick Tunnel / ngrok).
 *
 * Node runs the event loop single-threaded, so each `command()` call is
 * naturally atomic — matching the atomicity the app relies on from Redis
 * (duplicate-submission SET NX, fastest-tap EVAL, etc.).
 */

type MemEntry =
  | { kind: "string"; value: string; expiresAt: number | null }
  | { kind: "hash"; fields: Map<string, string>; expiresAt: number | null }
  | { kind: "set"; members: Set<string>; expiresAt: number | null };

export interface MemoryStore {
  command(cmd: (string | number)[]): any;
  pipeline(cmds: (string | number)[][]): any[];
}

export function createMemoryStore(): MemoryStore {
  const store = new Map<string, MemEntry>();

  function isAlive(e: MemEntry): boolean {
    return e.expiresAt === null || e.expiresAt > Date.now();
  }

  function getEntry(key: string): MemEntry | null {
    const e = store.get(key);
    if (!e) return null;
    if (!isAlive(e)) {
      store.delete(key);
      return null;
    }
    return e;
  }

  function setEntry(key: string, entry: MemEntry, ex?: number, nx?: boolean): boolean {
    if (nx && getEntry(key)) return false;
    entry.expiresAt = ex ? Date.now() + ex * 1000 : null;
    store.set(key, entry);
    return true;
  }

  /**
   * Runs the app's SUBMIT_LUA script (the only EVAL the API issues):
   *   EVAL script numkeys
   *        KEYS[1]=submission KEYS[2]=rank-list KEYS[3]=fastest KEYS[4]=fastestLatest
   *        ARGV[1]=submission JSON ARGV[2]=rank-detail JSON ("" for wrong answers)
   * Returns "DUPLICATE" or a JSON string { status, rank, speedBonus }.
   */
  function runSubmitEval(cmd: (string | number)[]): string {
    const numKeys = Number(cmd[2]) || 0;
    const keys = cmd.slice(3, 3 + numKeys).map(String);
    const args = cmd.slice(3 + numKeys).map(String);
    const [subKey, rankKey, fastestKey, fastestLatestKey] = keys;
    const [subJson, detailJson] = args;

    // SET KEYS[1] ARGV[1] EX 86400 NX — reject duplicates, never touch the
    // ranking/fastest records on a duplicate.
    if (!setEntry(subKey, { kind: "string", value: subJson, expiresAt: null }, 86400, true)) {
      return "DUPLICATE";
    }

    if (detailJson === "") {
      // Wrong answer: no speed ranking, no fastest-tap update.
      return JSON.stringify({ status: "OK", rank: 0, speedBonus: 0 });
    }

    // Correct answer: insert into the deterministic per-question ranking
    // ordered by (responseTimeMs ASC, submittedAt ASC, participantId ASC).
    let list: any[] = [];
    const cur = getEntry(rankKey);
    if (cur && cur.kind === "string") {
      try {
        const parsed = JSON.parse(cur.value);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    }
    const entry = JSON.parse(detailJson);
    const cmp = (a: any, b: any) => {
      const t = Number(a.responseTimeMs) - Number(b.responseTimeMs);
      if (t !== 0) return t;
      const ts = String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
      if (ts !== 0) return ts;
      return Number(a.participantId) - Number(b.participantId);
    };
    list.push(entry);
    list.sort(cmp);
    list.forEach((e, i) => {
      e.rank = i + 1;
      e.speedBonus = i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1 : 0;
    });
    setEntry(rankKey, { kind: "string", value: JSON.stringify(list), expiresAt: null }, 86400);
    const fastest = list[0];
    setEntry(fastestKey, { kind: "string", value: JSON.stringify(fastest), expiresAt: null }, 86400);
    setEntry(fastestLatestKey, { kind: "string", value: JSON.stringify(fastest), expiresAt: null }, 86400);
    return JSON.stringify({ status: "OK", rank: entry.rank, speedBonus: entry.speedBonus });
  }

  function command(cmd: (string | number)[]): any {
    const name = String(cmd[0]).toUpperCase();
    const a = cmd.slice(1).map(String);

    switch (name) {
      case "PING":
        return "PONG";
      case "FLUSHDB":
        store.clear();
        return "OK";
      case "GET": {
        const e = getEntry(a[0]);
        return e && e.kind === "string" ? e.value : null;
      }
      case "SET": {
        // SET key value [EX seconds] [NX]
        let ex: number | undefined;
        let nx = false;
        for (let i = 2; i < a.length; i++) {
          const t = a[i].toUpperCase();
          if (t === "EX" && i + 1 < a.length) {
            ex = Number(a[i + 1]);
            i++;
          } else if (t === "NX") {
            nx = true;
          }
        }
        const ok = setEntry(a[0], { kind: "string", value: a[1], expiresAt: null }, ex, nx);
        return ok ? "OK" : null;
      }
      case "INCR": {
        const cur = getEntry(a[0]);
        const base = cur && cur.kind === "string" ? Number(cur.value) || 0 : 0;
        const n = base + 1;
        setEntry(a[0], { kind: "string", value: String(n), expiresAt: null });
        return n;
      }
      case "INCRBY": {
        const cur = getEntry(a[0]);
        const base = cur && cur.kind === "string" ? Number(cur.value) || 0 : 0;
        const n = base + (Number(a[1]) || 0);
        setEntry(a[0], { kind: "string", value: String(n), expiresAt: null });
        return n;
      }
      case "DEL": {
        let n = 0;
        for (const k of a) {
          if (store.delete(k)) n++;
        }
        return n;
      }
      case "EXPIRE": {
        const e = getEntry(a[0]);
        if (!e) return 0;
        e.expiresAt = Date.now() + (Number(a[1]) || 0) * 1000;
        return 1;
      }
      case "HSET": {
        let e = getEntry(a[0]);
        if (!e) {
          e = { kind: "hash", fields: new Map(), expiresAt: null };
          store.set(a[0], e);
        }
        if (e.kind !== "hash") return 0;
        e.fields.set(a[1], a[2]);
        return 1;
      }
      case "HGET": {
        const e = getEntry(a[0]);
        return e && e.kind === "hash" ? (e.fields.get(a[1]) ?? null) : null;
      }
      case "HDEL": {
        const e = getEntry(a[0]);
        if (!e || e.kind !== "hash") return 0;
        let n = 0;
        for (const f of a.slice(1)) {
          if (e.fields.delete(f)) n++;
        }
        return n;
      }
      case "HGETALL": {
        const e = getEntry(a[0]);
        if (!e || e.kind !== "hash") return {};
        const out: Record<string, string> = {};
        for (const [f, v] of e.fields) out[f] = v;
        return out;
      }
      case "SADD": {
        let e = getEntry(a[0]);
        if (!e) {
          e = { kind: "set", members: new Set(), expiresAt: null };
          store.set(a[0], e);
        }
        if (e.kind !== "set") return 0;
        let n = 0;
        for (const m of a.slice(1)) {
          if (!e.members.has(m)) {
            e.members.add(m);
            n++;
          }
        }
        return n;
      }
      case "SREM": {
        const e = getEntry(a[0]);
        if (!e || e.kind !== "set") return 0;
        let n = 0;
        for (const m of a.slice(1)) {
          if (e.members.delete(m)) n++;
        }
        return n;
      }
      case "SMEMBERS": {
        const e = getEntry(a[0]);
        return e && e.kind === "set" ? [...e.members] : [];
      }
      case "SISMEMBER": {
        const e = getEntry(a[0]);
        return e && e.kind === "set" && e.members.has(a[1]) ? 1 : 0;
      }
      case "SCARD": {
        const e = getEntry(a[0]);
        return e && e.kind === "set" ? e.members.size : 0;
      }
      case "EVAL":
        return runSubmitEval(cmd);
      default:
        throw new Error(`Unsupported in-memory store command: ${name}`);
    }
  }

  function pipeline(cmds: (string | number)[][]): any[] {
    return cmds.map((c) => {
      try {
        return command(c);
      } catch (err: any) {
        // Mirrors Upstash's per-command error slot in a pipeline response.
        return { error: err?.message || "command failed" };
      }
    });
  }

  return { command, pipeline };
}
