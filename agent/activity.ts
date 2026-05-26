import { EventEmitter } from "node:events";

export type ActivityKind =
  | "agent_thought"
  | "tool_call"
  | "x402_payment"
  | "bounty_posted"
  | "submission_received"
  | "winner_declared"
  | "confirm_requested"
  | "confirm_resolved"
  | "telegram_in"
  | "telegram_out"
  | "error";

export interface ActivityEvent {
  id: string;
  ts: number;
  kind: ActivityKind;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

class ActivityBus extends EventEmitter {
  private buffer: ActivityEvent[] = [];
  private cap = 200;

  push(evt: Omit<ActivityEvent, "id" | "ts"> & { id?: string; ts?: number }): ActivityEvent {
    const full: ActivityEvent = {
      id: evt.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: evt.ts ?? Date.now(),
      kind: evt.kind,
      title: evt.title,
      body: evt.body,
      data: evt.data,
    };
    this.buffer.push(full);
    if (this.buffer.length > this.cap) this.buffer.splice(0, this.buffer.length - this.cap);
    this.emit("activity", full);
    return full;
  }

  recent(n = 25): ActivityEvent[] {
    return this.buffer.slice(-n);
  }
}

// Process-global singleton so dashboard SSE and bot share the same stream.
declare global {
  // eslint-disable-next-line no-var
  var __studyhire_activity_bus__: ActivityBus | undefined;
}

export const activity: ActivityBus =
  globalThis.__studyhire_activity_bus__ ?? (globalThis.__studyhire_activity_bus__ = new ActivityBus());
