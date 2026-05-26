"use client";

import { useState } from "react";

export function Flashcard({ q, a, n, delay = 0 }: { q: string; a: string; n: number; delay?: number }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="perspective h-56 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        onClick={() => setFlipped((v) => !v)}
        className="relative w-full h-full preserve-3d transition-transform duration-700 cursor-pointer group"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* ── Front: Question ── */}
        <div className="absolute inset-0 backface-hidden rounded-2xl bg-gradient-to-br from-panel via-panel to-bg border border-line p-5 card-glow flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Q{n}
            </span>
            <span className="text-[10px] text-mute opacity-0 group-hover:opacity-100 transition-opacity">
              tap to flip ↻
            </span>
          </div>
          <p className="text-ink text-[15px] leading-relaxed font-medium flex-1">{q}</p>
          <div className="mt-3 pt-3 border-t border-line/60">
            <span className="text-[10px] text-mute">Tap to reveal answer</span>
          </div>
        </div>

        {/* ── Back: Answer ── */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl bg-gradient-to-br from-ok/10 via-panel to-bg border border-ok/30 p-5 flex flex-col"
             style={{ boxShadow: "0 8px 32px -8px rgba(51, 209, 122, 0.25)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-ok">
              <span className="w-1.5 h-1.5 rounded-full bg-ok" />
              Answer
            </span>
            <span className="text-[10px] text-mute opacity-0 group-hover:opacity-100 transition-opacity">
              tap to flip back ↺
            </span>
          </div>
          <p className="text-ink text-[14px] leading-relaxed flex-1">{a}</p>
        </div>
      </div>
    </div>
  );
}
