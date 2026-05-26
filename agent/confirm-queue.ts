import { activity } from "./activity";

export type ConfirmStatus = "pending" | "approved" | "aborted" | "timed_out";

export interface ConfirmAction {
  id: string;
  createdAt: number;
  expiresAt: number;
  status: ConfirmStatus;
  amountUsd: number;
  kind: string;
  summary: string;
  data: Record<string, unknown>;
  resolve: (status: Exclude<ConfirmStatus, "pending">) => void;
}

const TTL_MS = 5 * 60 * 1000;

class ConfirmQueue {
  private actions = new Map<string, ConfirmAction>();
  private nextId = 1;

  private newId(): string {
    return String(this.nextId++);
  }

  /**
   * Enqueue a high-value action and wait for the user to /confirm <id> or /abort <id>
   * via Telegram. Resolves with the final status. Auto-aborts after TTL_MS.
   */
  enqueue(args: {
    amountUsd: number;
    kind: string;
    summary: string;
    data?: Record<string, unknown>;
  }): { id: string; awaiting: Promise<ConfirmStatus> } {
    const id = this.newId();
    let resolveFn!: (s: Exclude<ConfirmStatus, "pending">) => void;
    const awaiting = new Promise<ConfirmStatus>((resolve) => {
      resolveFn = (s) => resolve(s);
    });

    const action: ConfirmAction = {
      id,
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
      status: "pending",
      amountUsd: args.amountUsd,
      kind: args.kind,
      summary: args.summary,
      data: args.data ?? {},
      resolve: (s) => {
        action.status = s;
        resolveFn(s);
        activity.push({
          kind: "confirm_resolved",
          title: `Action ${id} ${s}`,
          body: args.summary,
          data: { id, status: s, amountUsd: args.amountUsd },
        });
      },
    };

    this.actions.set(id, action);
    activity.push({
      kind: "confirm_requested",
      title: `Confirmation needed (#${id}) — $${args.amountUsd.toFixed(2)}`,
      body: args.summary,
      data: { id, amountUsd: args.amountUsd, kind: args.kind },
    });

    setTimeout(() => {
      const cur = this.actions.get(id);
      if (cur && cur.status === "pending") cur.resolve("timed_out");
    }, TTL_MS);

    return { id, awaiting };
  }

  get(id: string): ConfirmAction | undefined {
    return this.actions.get(id);
  }

  listPending(): ConfirmAction[] {
    return [...this.actions.values()].filter((a) => a.status === "pending");
  }

  confirm(id: string): { ok: boolean; reason?: string } {
    const a = this.actions.get(id);
    if (!a) return { ok: false, reason: "no_such_action" };
    if (a.status !== "pending") return { ok: false, reason: `already_${a.status}` };
    a.resolve("approved");
    return { ok: true };
  }

  abort(id: string): { ok: boolean; reason?: string } {
    const a = this.actions.get(id);
    if (!a) return { ok: false, reason: "no_such_action" };
    if (a.status !== "pending") return { ok: false, reason: `already_${a.status}` };
    a.resolve("aborted");
    return { ok: true };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __studyhire_confirm_queue__: ConfirmQueue | undefined;
}

export const confirmQueue: ConfirmQueue =
  globalThis.__studyhire_confirm_queue__ ?? (globalThis.__studyhire_confirm_queue__ = new ConfirmQueue());
