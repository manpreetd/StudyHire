import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * D2L scraper stub. The hackathon plan says a real scraper was written tonight,
 * but the working directory is empty so this is a seed implementation: it writes
 * a plausible cache file for a course so the downstream trigger has something to
 * react to during the demo.
 *
 * Replace fetchCourse() with the real D2L fetch logic when available.
 */

interface CourseDump {
  courseId: string;
  name: string;
  fetchedAt: number;
  exams: Array<{ title: string; dueAt: number; topics: string[] }>;
  announcements: Array<{ ts: number; text: string }>;
}

async function fetchCourse(courseId: string): Promise<CourseDump> {
  const now = Date.now();
  const threeDays = 3 * 24 * 3600 * 1000;
  return {
    courseId,
    name: `${courseId} — Software Abstraction & Specification`,
    fetchedAt: now,
    exams: [
      {
        title: `${courseId} Final Exam`,
        dueAt: now + threeDays,
        topics: ["program correctness", "data abstraction", "recursion + induction", "modular design", "Java specs"],
      },
    ],
    announcements: [
      { ts: now - 3600_000, text: "Final exam study guide posted." },
      { ts: now - 86400_000, text: "Office hours moved to Thursday." },
    ],
  };
}

async function main() {
  const courseId = process.argv[2] ?? "CS246";
  const out = join(process.cwd(), "cache");
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const dump = await fetchCourse(courseId);
  writeFileSync(join(out, `${courseId}.json`), JSON.stringify(dump, null, 2));
  console.log(`✓ Wrote cache/${courseId}.json`);
}

if (process.argv[1]?.endsWith("d2l-fetch.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
