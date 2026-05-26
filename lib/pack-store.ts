import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { StudyPack } from "@/subagents/_lib/study-pack";

export interface StoredPack {
  id: string;
  createdAt: number;
  course: string;
  topic: string;
  winnerAgent: string;
  winnerRationale: string;
  pack: StudyPack;
  receipt: {
    txHash: string;
    explorerUrl: string;
    amountUsd: number;
  };
}

const STORE_DIR = join(process.cwd(), "cache", "packs");

function ensureDir() {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

export function savePack(data: Omit<StoredPack, "id" | "createdAt">): StoredPack {
  ensureDir();
  // Slugify course name and append short timestamp ID.
  const slug = data.course.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const id = `${slug}-${Date.now().toString(36)}`;
  const stored: StoredPack = { id, createdAt: Date.now(), ...data };
  writeFileSync(join(STORE_DIR, `${id}.json`), JSON.stringify(stored, null, 2));
  return stored;
}

export function loadPack(id: string): StoredPack | null {
  ensureDir();
  const p = join(STORE_DIR, `${id}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as StoredPack;
  } catch {
    return null;
  }
}

export function loadRecentPacks(n = 8): StoredPack[] {
  ensureDir();
  return readdirSync(STORE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, mtime: statSync(join(STORE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n)
    .flatMap(({ f }) => {
      try {
        return [JSON.parse(readFileSync(join(STORE_DIR, f), "utf-8")) as StoredPack];
      } catch {
        return [];
      }
    });
}
