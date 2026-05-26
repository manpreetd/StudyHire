import { activity } from "./activity";

export interface Course {
  id: string;
  name?: string;
  addedAt: number;
  detectedExams: Array<{ title: string; dueAt: number }>;
}

export interface AgentState {
  spendingLimitUsd: number;
  courses: Map<string, Course>;
  totalSpentUsd: number;
  bountiesPostedUsd: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __studyhire_state__: AgentState | undefined;
}

export const state: AgentState =
  globalThis.__studyhire_state__ ??
  (globalThis.__studyhire_state__ = {
    spendingLimitUsd: 5,
    courses: new Map(),
    totalSpentUsd: 0,
    bountiesPostedUsd: 0,
  });

export function setLimit(usd: number) {
  state.spendingLimitUsd = usd;
  activity.push({ kind: "agent_thought", title: `Spending limit set to $${usd.toFixed(2)}` });
}

export function addCourse(id: string, name?: string) {
  state.courses.set(id, { id, name, addedAt: Date.now(), detectedExams: [] });
  activity.push({ kind: "agent_thought", title: `Now tracking course ${id}` });
}

export function listCourses(): Course[] {
  return [...state.courses.values()];
}
