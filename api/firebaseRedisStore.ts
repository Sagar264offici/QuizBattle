import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

type StoredField = { key: string; value: string };
type Entry =
  | { kind: "string"; value: string; expiresAt: number | null }
  | { kind: "hash"; fields: Record<string, StoredField>; expiresAt: number | null }
  | { kind: "set"; members: Record<string, string>; expiresAt: number | null };

export interface FirebaseRedisStore {
  command(cmd: (string | number)[]): Promise<any>;
  pipeline(cmds: (string | number)[][]): Promise<any[]>;
}

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url") || "_";
const isAlive = (entry: any): entry is Entry =>
  !!entry &&
  typeof entry === "object" &&
  (entry.expiresAt == null || Number(entry.expiresAt) > Date.now());

function parseFirebaseConfig(): Record<string, any> {
  try {
    const raw = process.env.FIREBASE_CONFIG;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Minimal Redis command adapter backed by Firebase Realtime Database.
 * Each Redis-style key is isolated beneath /quizbattleRedis, so FLUSHDB
 * cannot touch unrelated Firebase data. EVAL uses a transaction at that
 * namespace root to preserve the app's duplicate-submit / fastest-rank atomicity.
 */
export function createFirebaseRedisStore(): FirebaseRedisStore {
  const config = parseFirebaseConfig();
  const databaseURL = (process.env.FIREBASE_DATABASE_URL || config.databaseURL || "").trim();
  if (!databaseURL) {
    throw new Error(
      "Firebase Realtime Database URL is missing. Create a Realtime Database and set FIREBASE_DATABASE_URL, or ensure FIREBASE_CONFIG contains databaseURL.",
    );
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      databaseURL,
      ...(config.projectId ? { projectId: config.projectId } : {}),
    });
  }

  const root = getDatabase().ref("quizbattleRedis");
  const refFor = (key: string) => root.child(encode(key));

  async function getLive(ref: ReturnType<typeof root.child>): Promise<Entry | null> {
    const result = await ref.transaction(
      (current: Entry | null) => {
        if (!current) return null;
        if (!isAlive(current)) return null;
        return current;
      },
      undefined,
      false,
    );
    const entry = result.snapshot.val() as Entry | null;
    return isAlive(entry) ? entry : null;
  }

  async function mutate(
    key: string,
    updater: (current: Entry | null) => { next: Entry | null; result: any },
  ): Promise<any> {
    let resultValue: any = null;
    await refFor(key).transaction(
      (raw: Entry | null) => {
        const current = isAlive(raw) ? raw : null;
        const updated = updater(current);
        resultValue = updated.result;
        return updated.next;
      },
      undefined,
      false,
    );
    return resultValue;
  }

  async function runEval(cmd: (string | number)[]): Promise<string> {
    const numKeys = Number(cmd[2]) || 0;
    if (numKeys !== 4) throw new Error("Unsupported EVAL key count");
    const keys = cmd.slice(3, 3 + numKeys).map(String);
    const [submissionJson, detailJson, bonusMode] = cmd.slice(3 + numKeys).map(String);
    const [submissionKey, rankKey, fastestKey, fastestLatestKey] = keys;
    let resultText = "";

    await root.transaction(
      (raw: Record<string, Entry> | null) => {
        const state: Record<string, Entry> = raw && typeof raw === "object" ? { ...raw } : {};
        const subEncoded = encode(submissionKey);
        const existing = state[subEncoded];
        if (isAlive(existing)) {
          resultText = "DUPLICATE";
          return;
        }
        if (existing) delete state[subEncoded];

        const expiry = Date.now() + 86400_000;
        state[subEncoded] = { kind: "string", value: submissionJson, expiresAt: expiry };

        if (!detailJson) {
          resultText = JSON.stringify({ status: "OK", rank: 0, speedBonus: 0 });
          return state;
        }

        const rankEncoded = encode(rankKey);
        const prior = state[rankEncoded];
        let list: any[] = [];
        if (isAlive(prior) && prior.kind === "string") {
          try {
            const parsed = JSON.parse(prior.value);
            if (Array.isArray(parsed)) list = parsed;
          } catch {
            list = [];
          }
        } else if (prior) {
          delete state[rankEncoded];
        }

        const entry = JSON.parse(detailJson);
        list.push(entry);
        list.sort((a, b) => {
          const timeDiff = Number(a.responseTimeMs) - Number(b.responseTimeMs);
          if (timeDiff !== 0) return timeDiff;
          const timestampDiff = String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
          if (timestampDiff !== 0) return timestampDiff;
          return Number(a.participantId) - Number(b.participantId);
        });

        list.forEach((item, index) => {
          item.rank = index + 1;
          item.speedBonus =
            bonusMode === "bonus" ? (index === 0 ? 3 : index === 1 ? 2 : index === 2 ? 1 : 0) : 0;
        });

        const fastest = list[0];
        state[rankEncoded] = {
          kind: "string",
          value: JSON.stringify(list),
          expiresAt: expiry,
        };
        state[encode(fastestKey)] = {
          kind: "string",
          value: JSON.stringify(fastest),
          expiresAt: expiry,
        };
        state[encode(fastestLatestKey)] = {
          kind: "string",
          value: JSON.stringify(fastest),
          expiresAt: expiry,
        };
        resultText = JSON.stringify({
          status: "OK",
          rank: Number(entry.rank) || 0,
          speedBonus: Number(entry.speedBonus) || 0,
        });
        return state;
      },
      undefined,
      false,
    );

    if (!resultText) throw new Error("Firebase transaction did not produce an EVAL result");
    return resultText;
  }

  async function command(cmd: (string | number)[]): Promise<any> {
    const name = String(cmd[0] || "").toUpperCase();
    const args = cmd.slice(1).map(String);

    switch (name) {
      case "PING":
        return "PONG";

      case "GET": {
        const entry = await getLive(refFor(args[0]));
        return entry?.kind === "string" ? entry.value : null;
      }

      case "SET": {
        const key = args[0];
        const value = args[1] ?? "";
        let ex: number | null = null;
        let nx = false;
        for (let i = 2; i < args.length; i++) {
          const flag = args[i].toUpperCase();
          if (flag === "EX" && i + 1 < args.length) {
            ex = Math.max(0, Number(args[++i]) || 0);
          } else if (flag === "NX") {
            nx = true;
          }
        }
        let blocked = false;
        await refFor(key).transaction(
          (raw: Entry | null) => {
            const current = isAlive(raw) ? raw : null;
            if (nx && current) {
              blocked = true;
              return current;
            }
            blocked = false;
            return {
              kind: "string",
              value,
              expiresAt: ex ? Date.now() + ex * 1000 : null,
            } satisfies Entry;
          },
          undefined,
          false,
        );
        return blocked ? null : "OK";
      }

      case "INCR":
      case "INCRBY": {
        const key = args[0];
        const increment = name === "INCR" ? 1 : Number(args[1]) || 0;
        let nextValue = 0;
        await refFor(key).transaction(
          (raw: Entry | null) => {
            const current = isAlive(raw) ? raw : null;
            if (current && current.kind !== "string") {
              throw new Error("WRONGTYPE: value is not a string");
            }
            const base = current?.kind === "string" ? Number(current.value) || 0 : 0;
            nextValue = base + increment;
            return { kind: "string", value: String(nextValue), expiresAt: null } satisfies Entry;
          },
          undefined,
          false,
        );
        return nextValue;
      }

      case "DEL": {
        const removed = await Promise.all(args.map(async (key) => {
          let hadEntry = false;
          await refFor(key).transaction(
            (raw: Entry | null) => {
              hadEntry = isAlive(raw);
              return null;
            },
            undefined,
            false,
          );
          return hadEntry ? 1 : 0;
        }));
        return removed.reduce((sum, value) => sum + value, 0);
      }

      case "EXPIRE": {
        const key = args[0];
        const seconds = Math.max(0, Number(args[1]) || 0);
        let found = false;
        await refFor(key).transaction(
          (raw: Entry | null) => {
            const current = isAlive(raw) ? raw : null;
            found = !!current;
            return current ? { ...current, expiresAt: Date.now() + seconds * 1000 } as Entry : null;
          },
          undefined,
          false,
        );
        return found ? 1 : 0;
      }

      case "HSET":
        return mutate(args[0], (current) => {
          if (current && current.kind !== "hash") throw new Error("WRONGTYPE: value is not a hash");
          const fields = current?.kind === "hash" ? { ...current.fields } : {};
          const fieldKey = args[1];
          const existed = !!fields[encode(fieldKey)];
          fields[encode(fieldKey)] = { key: fieldKey, value: args[2] ?? "" };
          return {
            next: { kind: "hash", fields, expiresAt: current?.expiresAt ?? null },
            result: existed ? 0 : 1,
          };
        });

      case "HGET": {
        const entry = await getLive(refFor(args[0]));
        return entry?.kind === "hash" ? entry.fields[encode(args[1])]?.value ?? null : null;
      }

      case "HGETALL": {
        const entry = await getLive(refFor(args[0]));
        if (entry?.kind !== "hash") return {};
        const out: Record<string, string> = {};
        for (const field of Object.values(entry.fields)) out[field.key] = field.value;
        return out;
      }

      case "HDEL":
        return mutate(args[0], (current) => {
          if (!current || current.kind !== "hash") return { next: current, result: 0 };
          const fields = { ...current.fields };
          let removed = 0;
          for (const field of args.slice(1)) {
            const id = encode(field);
            if (fields[id]) {
              delete fields[id];
              removed++;
            }
          }
          return {
            next: Object.keys(fields).length ? { ...current, fields } : null,
            result: removed,
          };
        });

      case "SADD":
        return mutate(args[0], (current) => {
          if (current && current.kind !== "set") throw new Error("WRONGTYPE: value is not a set");
          const members = current?.kind === "set" ? { ...current.members } : {};
          let added = 0;
          for (const member of args.slice(1)) {
            const id = encode(member);
            if (!(id in members)) {
              members[id] = member;
              added++;
            }
          }
          return {
            next: { kind: "set", members, expiresAt: current?.expiresAt ?? null },
            result: added,
          };
        });

      case "SREM":
        return mutate(args[0], (current) => {
          if (!current || current.kind !== "set") return { next: current, result: 0 };
          const members = { ...current.members };
          let removed = 0;
          for (const member of args.slice(1)) {
            const id = encode(member);
            if (id in members) {
              delete members[id];
              removed++;
            }
          }
          return {
            next: Object.keys(members).length ? { ...current, members } : null,
            result: removed,
          };
        });

      case "SMEMBERS": {
        const entry = await getLive(refFor(args[0]));
        return entry?.kind === "set" ? Object.values(entry.members) : [];
      }

      case "SISMEMBER": {
        const entry = await getLive(refFor(args[0]));
        return entry?.kind === "set" && encode(args[1]) in entry.members ? 1 : 0;
      }

      case "SCARD": {
        const entry = await getLive(refFor(args[0]));
        return entry?.kind === "set" ? Object.keys(entry.members).length : 0;
      }

      case "FLUSHDB":
        await root.remove();
        return "OK";

      case "EVAL":
        return runEval(cmd);

      default:
        throw new Error(`Unsupported Firebase-backed Redis command: ${name}`);
    }
  }

  async function pipeline(cmds: (string | number)[][]): Promise<any[]> {
    return Promise.all(cmds.map(async (cmd) => {
      try {
        return await command(cmd);
      } catch (error: any) {
        return { error: error?.message || "Firebase command failed" };
      }
    }));
  }

  return { command, pipeline };
}
