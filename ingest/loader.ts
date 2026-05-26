import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface CachedCourse {
  courseId: string;
  name: string;
  fetchedAt: number;
  exams: Array<{ title: string; dueAt: number; topics: string[] }>;
  announcements: Array<{ ts: number; text: string }>;
}

const CACHE_DIR = join(process.cwd(), "cache");

export function loadCourse(courseId: string): CachedCourse | undefined {
  const p = join(CACHE_DIR, `${courseId}.json`);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf-8")) as CachedCourse;
}

export function loadAll(): CachedCourse[] {
  if (!existsSync(CACHE_DIR)) return [];
  return readdirSync(CACHE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(CACHE_DIR, f), "utf-8")) as CachedCourse);
}
