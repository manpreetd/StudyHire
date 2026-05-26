"use client";

import { useEffect, useRef, useState } from "react";

type ActivityEvent = {
  id: string;
  ts: number;
  kind: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

const KIND_COLOR: Record<string, string> = {
  agent_thought:      "text-mute",
  tool_call:          "text-accent",
  x402_payment:       "text-ok",
  bounty_posted:      "text-ok",
  submission_received:"text-ink",
  winner_declared:    "text-ok",
  confirm_requested:  "text-warn",
  confirm_resolved:   "text-ink",
  telegram_in:        "text-accent",
  telegram_out:       "text-ink",
  error:              "text-err",
};

const KIND_DOT: Record<string, string> = {
  x402_payment:      "bg-ok",
  bounty_posted:     "bg-ok",
  winner_declared:   "bg-ok",
  confirm_requested: "bg-warn",
  error:             "bg-err",
  telegram_in:       "bg-accent",
  telegram_out:      "bg-accent",
};

export default function Page() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [latestPack, setLatestPack] = useState<{ id: string; course: string; topic: string; url: string } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/agent/status");
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as ActivityEvent;
        setEvents((prev) => {
          if (prev.some((p) => p.id === evt.id)) return prev;
          const next = [...prev, evt];
          return next.length > 200 ? next.slice(-200) : next;
        });
        // Surface the latest study pack card from winner_declared events
        if (evt.kind === "winner_declared" && evt.data?.packId) {
          const packId = evt.data.packId as string;
          const url = (evt.data.dashboardUrl as string) ?? `http://localhost:3000/pack/${packId}`;
          // Extract course/topic from the title "Winner: <agent> for <topic>"
          const topicMatch = evt.title.match(/for (.+)$/);
          setLatestPack({
            id: packId,
            course: "",
            topic: topicMatch?.[1] ?? evt.title,
            url,
          });
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events]);

  return (
    <main className="min-h-screen bg-bg text-ink font-mono antialiased px-6 py-8">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">
            StudyHire <span className="text-mute font-normal">— agent dashboard</span>
          </h1>
          <p className="text-mute text-xs mt-1">
            Interact via Telegram · this page shows live agent activity
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-mute">
          <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse inline-block" />
          live
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

        {/* ── Activity stream ── */}
        <section className="border border-line rounded-xl bg-panel overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <span className="text-mute text-xs uppercase tracking-widest">activity stream</span>
            <span className="text-mute text-xs">{events.length} events</span>
          </div>
          <div ref={listRef} className="p-4 max-h-[72vh] overflow-y-auto space-y-1.5 text-xs">
            {events.length === 0 && (
              <div className="text-mute py-8 text-center">
                Waiting for activity…<br />
                <span className="text-accent">Message your Telegram bot to start.</span>
              </div>
            )}
            {events.map((e) => {
              const dot = KIND_DOT[e.kind];
              const packUrl = e.kind === "winner_declared" && e.data?.packId
                ? `http://localhost:3000/pack/${e.data.packId}`
                : null;

              return (
                <div key={e.id} className="flex gap-3 items-start py-0.5 hover:bg-bg/50 rounded px-1 -mx-1 transition-colors">
                  <span className="text-mute shrink-0 tabular-nums w-[72px]">
                    {new Date(e.ts).toISOString().slice(11, 19)}
                  </span>
                  <span className="shrink-0 w-1.5 mt-1.5">
                    {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot} inline-block`} />}
                  </span>
                  <span className={`shrink-0 w-36 ${KIND_COLOR[e.kind] ?? "text-ink"}`}>
                    {e.kind.replace(/_/g, " ")}
                  </span>
                  <span className="text-ink min-w-0">
                    {e.title}
                    {e.body ? (
                      <span className="text-mute"> — {e.body.slice(0, 200)}</span>
                    ) : null}
                    {packUrl && (
                      <a
                        href={packUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-accent hover:underline"
                      >
                        view pack ↗
                      </a>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Right sidebar ── */}
        <aside className="space-y-4">

          {/* Latest study pack card */}
          {latestPack && (
            <a
              href={latestPack.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border border-ok/40 rounded-xl bg-ok/5 p-4 hover:bg-ok/10 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-ok text-xs uppercase tracking-widest">Latest study pack</span>
                <span className="text-ok group-hover:translate-x-0.5 transition-transform">↗</span>
              </div>
              <p className="text-ink text-sm font-bold capitalize">{latestPack.topic}</p>
              {latestPack.course && (
                <p className="text-mute text-xs mt-0.5">{latestPack.course}</p>
              )}
              <p className="text-ok/70 text-xs mt-2">Click to open dashboard →</p>
            </a>
          )}

          {/* How to demo */}
          <div className="border border-line rounded-xl bg-panel p-4 text-xs">
            <div className="text-mute uppercase tracking-widest mb-3">demo script</div>
            <ol className="space-y-2.5 text-mute">
              <li className="flex gap-2">
                <span className="text-accent shrink-0">1.</span>
                <span>
                  Send <code className="text-accent bg-accent/10 px-1 rounded">/start</code> — self-disclosure
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">2.</span>
                <span>
                  Send <code className="text-accent bg-accent/10 px-1 rounded">/prep CS246 recursion</code> — full pipeline, link appears above
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-warn shrink-0">3.</span>
                <span>
                  Send <code className="text-warn bg-warn/10 px-1 rounded">/run propose a $25 bounty</code> — confirmation gate fires
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-warn shrink-0">4.</span>
                <span>
                  Reply <code className="text-warn bg-warn/10 px-1 rounded">/confirm 1</code> — bounty executes
                </span>
              </li>
            </ol>
          </div>

          {/* Rubric map */}
          <div className="border border-line rounded-xl bg-panel p-4 text-xs">
            <div className="text-mute uppercase tracking-widest mb-3">rubric coverage</div>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
                <span className="text-mute">GK1 — ERC-8004 · agents #39-44</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
                <span className="text-mute">Cat 2 — /start self-disclosure</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
                <span className="text-mute">Cat 3 — /prep x402 payment</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
                <span className="text-mute">Cat 4 — /run + /confirm gate</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-mute">Cat 1 — 5% take-rate pitch</span>
              </li>
            </ul>
          </div>

          {/* Chain info */}
          <div className="border border-line rounded-xl bg-panel p-4 text-xs text-mute">
            <div className="uppercase tracking-widest mb-2">network</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Chain</span><span className="text-accent">GOAT mainnet · 2345</span>
              </div>
              <div className="flex justify-between">
                <span>ERC-8004</span>
                <span className="text-ink">0x8004…a432</span>
              </div>
              <div className="flex justify-between">
                <span>x402 endpoint</span>
                <span className="text-ink">:4001/extract</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
