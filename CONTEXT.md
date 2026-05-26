# StudyHire — Session Context

Use this file to get a new Claude session up to speed on exactly where this project stands.

---

## What this project is

**StudyHire** is an autonomous exam-prep budget manager built for the OpenClaw hackathon (Toronto, May 26 2026).

- The **Telegram bot** is the judging surface — judges interact exclusively through it.
- The **Next.js dashboard** (`npm run dev`, port 3000) is now a real product surface:
  - `/` — activity stream (terminal-style, for judges to watch in real time)
  - `/pack/[id]` — **beautiful study-pack delivery page** (flippable flashcards, gradient hero, glassmorphism)
- The **orchestrator** is a Claude (Anthropic SDK) tool-use loop — NOT ClawUp (ClawUp stopped working day-of).
- Everything runs on **GOAT mainnet** (chain 2345, RPC `https://rpc.goat.network`).

Hackathon submission deadline: **5:45 PM today (May 26 2026)** at `https://bit.ly/openclaw-hackathon-submission`

---

## Rubric map

| Category | Points | Where it lives |
|---|---|---|
| Cat 1 — Market story / take-rate | 16pts | 5% take-rate in `contracts/StudyHire.sol`, pitch in README + `/start` |
| Cat 2 — Self-disclosure | 8pts | `/start`, `/help`, free-text fallback in `subagents/telegram-bot/index.ts` |
| Cat 3 — x402 protocol | 10pts | `/quickprep <topic>` and `/prep <course> <topic>` → topic-extractor + `agent/payments.ts` |
| Cat 4 — Guardrails | 6pts | `/run` → triggers orchestrator in-process → confirm queue → Telegram `/confirm <id>` |
| Gatekeeper 1 — ERC-8004 | required | ✅ **DONE** — 5 agents live on GOAT mainnet (IDs 39, 40, 42, 43, 44) |

---

## Architecture

```
Telegram chat (judge)
       │
       ├─ /start, /help         → SELF_DESCRIPTION (Cat 2)
       ├─ /quickprep <topic>    → quick topic breakdown via x402 ($0.10)
       ├─ /prep <course> <top>  → FULL PIPELINE — x402 → 2 agents compete → verifier
       │       ↓                  → saves StudyPack to cache/packs/<id>.json
       │       ↓                  → sends Telegram link to localhost:3000/pack/<id>
       │
       ├─ /run [prompt]         → runOrchestrator() in-process (Cat 4)
       │       ↓
       │   orchestrator (Claude tool-use loop)
       │   ├─ x402_extract_topics → topic-extractor
       │   └─ propose_bounty → confirm-queue → Telegram /confirm prompt
       │
       └─ /confirm, /abort      → confirm-queue.confirm/abort

Next.js dashboard (port 3000)
       ├─ /              → live activity stream (SSE), "latest pack" sidebar card
       └─ /pack/[id]     → beautiful study-pack page with flippable flashcards
                           (reads from cache/packs/<id>.json via lib/pack-store.ts)
```

**Key architectural notes:**
- The orchestrator runs INSIDE the bot process (via `/run` command). This is how they share the in-memory activity bus — running `npm run orchestrator` as a separate process would NOT fire /confirm Telegram notifications.
- The bot and Next.js are different processes — they share study-pack data via the filesystem (`cache/packs/<id>.json`).

---

## Key files

| File | What it does |
|---|---|
| `subagents/telegram-bot/index.ts` | Telegram bot — judging surface. Commands: /start /help /prep /quickprep /run /status /balance /addcourse /listcourses /confirm /abort /limit |
| `subagents/topic-extractor/index.ts` | Express on :4001, x402 paywall, calls Claude for 5 exam subtopics |
| `subagents/_lib/study-pack.ts` | Claude-powered study pack generator with robust JSON parsing (fence-stripping + truncation recovery) |
| `subagents/submitter-a/index.ts` | "Concise" style competing agent (HTTP service, optional) |
| `subagents/submitter-b/index.ts` | "Narrative" style competing agent (HTTP service, optional) |
| `subagents/verifier/index.ts` | Express on :4004, scores study packs, picks winner |
| `agent/orchestrator.ts` | Claude tool-use loop — list_tracked_courses, x402_extract_topics, propose_bounty |
| `agent/loop.ts` | Generic Anthropic tool-use runner (runAgent) |
| `agent/payments.ts` | x402 client — real USDC transfer path + mock fabrication path. **Bug fix:** handles GoatX402 SDK's snake_case `order_id` in 402 challenge body. |
| `agent/trigger.ts` | Periodic D2L cache scanner — fires orchestrator on detected upcoming exams |
| `agent/confirm-queue.ts` | Pending action store, 5-min TTL, confirm(id)/abort(id) |
| `agent/state.ts` | Process-global agent state (spending limit, courses, totals) |
| `agent/activity.ts` | Process-global event bus (SSE feed + Telegram push). `winner_declared` events now carry `data.packId` + `dashboardUrl`. |
| `agent/registry.ts` | ERC-8004 register/verify on GOAT mainnet. **No longer gated by `useMockChain`** — registry is always real. |
| `agent/bounty-client.ts` | Posts bounties to StudyHire.sol (mock path is used while StudyHire.sol is not deployed) |
| `agent/wallet.ts` | viem wallet helpers |
| **`lib/pack-store.ts`** | **NEW** — write/read study packs to/from `cache/packs/<id>.json`. Used by bot (write) and Next.js page (read). |
| `lib/env.ts` | Loads .env.local then .env via explicit dotenv config() calls. **Uses `override: true`** so stale shell env vars can't mask real values. |
| `lib/llm.ts` | Lazy Anthropic client, LLM cache, complete()/textOf()/toolCallsOf() |
| **`app/page.tsx`** | Activity dashboard (mono font, terminal feel). Renders `winner_declared` events with clickable "view pack ↗" link + sticky "latest pack" sidebar card. |
| **`app/pack/[id]/page.tsx`** | **NEW** — beautiful study-pack page (sans-serif, gradient hero, stats grid) |
| **`app/pack/[id]/Flashcard.tsx`** | **NEW** — client component, 3D card-flip on click |
| **`app/pack/[id]/PracticeCard.tsx`** | **NEW** — client component, collapsible hint reveal |
| `app/globals.css` | Custom utilities: glass, gradient-text, perspective, card-glow, noise overlay |
| `tailwind.config.ts` | Extended with `cyan`, `pink` colors and animations (fade-in, slide-up, float, glow) |
| `contracts/StudyHire.sol` | On-chain escrow, 5% take-rate (TAKE_BPS=500) — **NOT DEPLOYED YET** (running in mock mode) |
| `scripts/fund-agents.ts` | Distributes 0.0000004 GOAT from orchestrator to 4 sub-agent wallets so they can pay registration gas |
| `scripts/register-agents.ts` | Registers all 5 agents on ERC-8004 |
| `scripts/verify-erc8004.ts` | Hits 8004scan.io per-address URL to confirm visibility |
| `scripts/deploy-bounty.ts` | Scripted deploy (Remix is faster) |
| `ingest/d2l-fetch.ts` | D2L scraper stub — currently generates seed cache for demos |
| `ingest/loader.ts` | Reads `cache/*.json` course caches |

---

## Environment (.env.local — DO NOT COMMIT — all secrets live there)

Secrets (API keys, bot token, private keys, x402 credentials) are stored in `.env.local`,
which is gitignored. **Never paste the real values here** — GitHub push protection will
block the commit. Reference variable names only:

```
# Required to fill (already populated in .env.local locally):
ANTHROPIC_API_KEY=<redacted — get from console.anthropic.com>
TELEGRAM_BOT_TOKEN=<redacted — from @BotFather>
TELEGRAM_CHAT_ID=<your chat id — current: 8622570097>

# Spending gate
SPENDING_LIMIT_USD=5

# GOAT mainnet — public values, safe to share
GOAT_RPC_URL=https://rpc.goat.network
GOAT_CHAIN_ID=2345
USDC_ADDRESS=0x3022b87ac063DE95b1570F46f5e470F8B53112D8
ERC8004_REGISTRY_ADDRESS=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432

# Agent private keys — ALL REDACTED, in .env.local
ORCHESTRATOR_PRIVATE_KEY=<redacted>
TOPIC_EXTRACTOR_PRIVATE_KEY=<redacted>
SUBMITTER_A_PRIVATE_KEY=<redacted>
SUBMITTER_B_PRIVATE_KEY=<redacted>
VERIFIER_PRIVATE_KEY=<redacted>

# GoatX402 merchant — credentials in .env.local
GOATX402_API_URL=https://x402-merchant.goat.network
GOATX402_API_KEY=<redacted>
GOATX402_API_SECRET=<redacted>
GOATX402_MERCHANT_ID=studyhirebot

# Endpoints / pricing
X402_TOPIC_EXTRACTOR_URL=http://localhost:4001
X402_TOPIC_EXTRACTOR_PRICE_USD=0.10
STUDY_BOUNTY_ADDRESS=          ← empty — StudyHire.sol not deployed, USE_MOCK_CHAIN=true handles this
USE_MOCK_X402=false            ← live x402 confirmed working
USE_MOCK_CHAIN=true            ← keep TRUE until StudyHire.sol deployed
```

### Agent wallet addresses (ALL REGISTERED on ERC-8004 ✅)
| Agent | Address | ERC-8004 ID |
|---|---|---|
| ORCHESTRATOR    | `0x9cA4c6A53A7438d5A10D496e36BBeC352120d393` | **39** |
| TOPIC_EXTRACTOR | `0xA4edd279559d4ECb15745e669297129EDe56A24b` | **40** |
| SUBMITTER_A     | `0xB0cb245E5C17d8b7811b74393056E619a0F63aaE` | **42** |
| SUBMITTER_B     | `0xAb6bB4f4B59470c97100c0469d181C5978639941` | **43** |
| VERIFIER        | `0xf32696BDbb7346bc5c7ECC718310Cb3e07E98972` | **44** |

Verify: https://8004scan.io/agents?chain=2345

---

## Session 4 work log (THIS session — May 26 2026)

This is what got built/fixed since CONTEXT.md was last updated. Continue from here.

### 1. ERC-8004 gatekeeper — DONE ✅
- Created `scripts/fund-agents.ts` to distribute 0.0000004 GOAT from orchestrator → 4 sub-agents (small amount because orchestrator only had 0.00000195 GOAT)
- Fixed `agent/registry.ts` — removed `useMockChain` guard from `registerAgent()` and `verifyAgentWallet()` because the ERC-8004 registry is a real GOAT mainnet contract, independent of our own StudyBounty mock status
- Ran the chain successfully: `npm run fund-agents` → `npm run register` → `npm run verify-8004`
- All 5 agents now live on https://8004scan.io/agents?chain=2345

### 2. New `/prep <course> <topic>` command — the headline feature
The previous `/quickprep` only returned topic breakdowns. There was no way for a user to actually see a finished study pack — that's what `/prep` solves.

Pipeline (all in-process inside the bot):
1. POST to topic-extractor via x402 ($0.10 USDC) — uses `payAndFetch()`
2. Calls `produceStudyPack()` twice in parallel — once with "concise" flavor, once with "narrative" flavor
3. Sends both summaries to Claude verifier with a STRICT JSON prompt — picks winner A or B
4. Saves winning pack via `savePack()` to `cache/packs/<id>.json`
5. Sends Telegram message with link to `http://localhost:3000/pack/<id>`

### 3. Beautiful pack page UI — `app/pack/[id]/page.tsx`
Completely redesigned to be a product surface, not a debug page:
- Sticky glassmorphism nav with pulsing dot
- Hero with animated gradient backdrop, floating colored orbs, SVG noise overlay
- Big gradient-text title (pink → purple → cyan, slowly shifting via animation)
- Winner trophy card with subtle green glow
- 4-stat grid (Flashcards / Practice / x402 paid / Agents competed)
- x402 receipt strip with explorer link
- Quick summary section
- **Flippable 3D flashcards** (client component) — click any card to flip and reveal answer, staggered entrance animation (60ms each)
- **Collapsible practice hints** (client component) — "Show approach hint" button with smooth height transition (80ms stagger)
- "Behind the scenes" 4-card explainer of the agent pipeline
- Footer with gradient-text branding

Color/styling system:
- Extended `tailwind.config.ts` with `cyan`, `pink` colors and animations (fade-in, slide-up, float, glow)
- `globals.css` adds custom utilities: `.glass`, `.glass-strong`, `.gradient-text`, `.hero-gradient`, `.card-glow`, `.perspective`, `.preserve-3d`, `.backface-hidden`, `.rotate-y-180`, `.noise`
- Layout default font switched from `font-mono` → `font-sans` (pack page is sans-serif). Activity dashboard page still uses `font-mono` for terminal feel via class override.

### 4. Dashboard sidebar — "latest pack" card
`app/page.tsx` updated:
- Listens for `winner_declared` SSE events
- When one fires with `data.packId`, surfaces a prominent green "Latest study pack →" card in the sidebar
- Activity stream entries for `winner_declared` events now show a clickable "view pack ↗" link
- Cleaner styling: pulsing live indicator, demo script panel, rubric coverage, network info card

### 5. Robust JSON parsing for study packs
Fixed an error: `Expected ',' or ']' after array element in JSON at position 2785`. Two root causes:
1. **`maxTokens: 1200` was too small** — Claude's response was being cut off mid-JSON. Bumped to 2000.
2. **Claude wraps output in ` ```json ``` ` fences** despite the prompt — the previous regex `{[\s\S]*}` couldn't handle markdown fences OR truncation.

New `extractJson()` + `closeJson()` helpers in `subagents/_lib/study-pack.ts`:
- Strip markdown code fences
- Find first `{` and last `}`
- If truncated (no closing brace found), walk the string tracking unclosed `{`/`[` and append matching close-chars

Verifier scoring call in the bot also updated to do the same fence-stripping and to only send summaries (not full packs) for speed.

### 6. Telegram link clickability fix
Initial `/prep` reply used `[text](url)` Markdown links. Two failures observed:
1. Escaping `\(`/`\)` (MarkdownV2 syntax) broke v1 parser → entire message failed to format
2. Switched to HTML mode with `<a href="...">` — but **Telegram refuses to make `<a href>` clickable when the URL is localhost** (silently strips it to plain text)

Final fix: put the URL on its own line as plain text. Every Telegram client auto-linkifies plain URLs (including localhost), so the link is now tappable. Message format:
```
✅ Study pack ready!
📚 CS246 — recursion and induction
🏆 Agent A (concise) won the competition
"Dense factual coverage..."
💳 x402: 0xabc... ($0.10)

👉 Open your study pack:
http://localhost:3000/pack/cs246-xyz
```

### 7. Trigger loop wired into bot
`subagents/telegram-bot/index.ts` now imports and starts `startTriggerLoop(60_000)` at boot — scans `cache/*.json` every 60s for upcoming exams and fires the orchestrator autonomously. Empty cache → no-op.

### 8. USE_MOCK_CHAIN set to true
Switched `USE_MOCK_CHAIN=false` → `true` in `.env.local` because StudyHire.sol isn't deployed. `bounty-client.ts` already had the mock path implemented; this avoids a crash when `/run` posts a bounty.

---

## Current status

### Done ✅
- [x] All TypeScript compiles cleanly (`npm run typecheck` → 0 errors)
- [x] Telegram bot working with all commands
- [x] **ERC-8004 gatekeeper green** — 5 agents registered, IDs 39, 40, 42, 43, 44
- [x] **Live x402 path working** — `/quickprep` does real USDC transfer (orchestrator wallet has 5.00 USDC + ~0.000002 GOAT remaining)
- [x] **`/prep` command** — full pipeline delivering a real study pack to a beautiful page
- [x] **Beautiful UI** — gradient hero, 3D flashcards, glassmorphism, animations
- [x] **Robust JSON parsing** — Claude fence/truncation issues fixed
- [x] **Trigger loop** wired into bot (autonomous exam detection from D2L cache)

### Required to demo / submit 🔴

**1. Submit hackathon form** before 5:45 PM today:
- https://bit.ly/openclaw-hackathon-submission
- Repo: https://github.com/manpreetd/StudyHire
- Agent IDs to list: 39, 40, 42, 43, 44
- ERC-8004 registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Chain: 2345 (GOAT mainnet)
- x402 endpoint: `http://localhost:4001/extract`

**2. End-to-end smoke test** before demo:
- Terminal 1: `npm run dev` (Next.js dashboard at :3000)
- Terminal 2: `npm run extractor` (x402 service at :4001)
- Terminal 3: `npm run bot` (Telegram polling)
- In Telegram: `/start` → should return SELF_DESCRIPTION
- `/prep CS246 recursion and induction` → wait ~15s → tap the localhost link → beautiful pack page should load with flippable flashcards
- `/run propose a $25 bounty for CS246 final` → confirm prompt fires → `/confirm 1` → bounty executes (mock)

### Optional polish (if time)
- [ ] Deploy `contracts/StudyHire.sol` via Remix and flip `USE_MOCK_CHAIN=false` (need MetaMask + GOAT mainnet network added + ~0.001 GOAT for deploy gas)
- [ ] ngrok the Next.js server (`npx ngrok http 3000`) and replace `localhost:3000` in the bot's `/prep` final message → judges can open the pack on their own devices instead of your laptop
- [ ] Add a `/listpacks` command to list recent study packs

### Known limitations (don't fix unless asked)
- D2L scraper (`ingest/d2l-fetch.ts`) is a stub — generates fake exam cache. Real D2L cookie scraping not implemented. For demo, run `npm run ingest CS246` to seed a fake `cache/CS246.json`.
- StudyHire.sol bounty escrow runs in mock mode (`USE_MOCK_CHAIN=true`). `bounty-client.ts` returns synthesized `0xmock-…` tx hashes. Real escrow works once the contract is deployed.
- Submitter-A and Submitter-B are exposed as separate HTTP services on :4002/:4003 but `/prep` calls `produceStudyPack()` inline for simplicity — saves 2 extra terminals during demo.

---

## How to run everything

```bash
# All 3 terminals from studyhire/ directory:
npm run dev          # Next.js dashboard (port 3000) — for /pack/[id] page
npm run extractor    # x402-paywalled topic service (port 4001)
npm run bot          # Telegram bot (polling) — this is the demo surface

# Optional: separate orchestrator process (NOT for /confirm-based demos)
npm run orchestrator -- "propose a $25 bounty for CS246 final"

# One-off scripts
npm run ingest CS246       # Seed cache/CS246.json with fake D2L data
npm run fund-agents        # Distribute GOAT gas to sub-agents
npm run register           # Register all 5 agents on ERC-8004
npm run verify-8004        # Confirm visibility on 8004scan.io
npm run typecheck          # tsc --noEmit
```

---

## Demo script (90 seconds)

| Step | Action | Rubric |
|---|---|---|
| 1 | Open browser at `localhost:3000` (dashboard) — point at live activity feed | — |
| 2 | Send `/start` to Telegram bot — show SELF_DESCRIPTION | Cat 2 ✅ |
| 3 | Send `/prep CS246 recursion and induction` | Cat 3 (x402) ✅ |
| 4 | While pipeline runs (~15s), narrate: "x402 micropayment fires → two ERC-8004 agents compete → Claude verifier picks the best one" | — |
| 5 | Tap link in Telegram → beautiful pack page opens. Click a flashcard to flip it. | Product polish |
| 6 | Back to Telegram: `/run propose a $25 bounty for CS246 final` | Cat 4 |
| 7 | "⚠️ HIGH-VALUE ACTION" prompt appears in chat → send `/confirm 1` | Cat 4 ✅ |
| 8 | Switch to dashboard tab — show all events streamed in real time. "5% take-rate built into StudyHire.sol. $4B global tutoring market." | Cat 1 ✅ |

---

## Past fixes (don't redo)
- Bot token was revoked once — ClawUp was consuming updates. Current token in .env.local.
- `lib/env.ts` calls `config({ path: ".env.local", override: true })` — must be `override:true` to defeat stale shell env vars.
- ERC-8004 ABI is `register(string)` only (one arg).
- Telegram commands: no hyphens — `/quickprep` not `/quick-prep`.
- ClawUp non-functional — orchestrator uses Anthropic SDK directly.
- Orchestrator and bot must share a process for /confirm notifications — use `/run` in the bot.
- GoatX402 SDK returns snake_case `order_id` (not `orderId`) in raw 402 challenge body — `payments.ts` handles both.
- `register-agents.ts` must NOT be gated by `useMockChain` — the ERC-8004 registry is always a real contract.
- Telegram won't make `<a href="http://localhost...">` clickable — put URLs on their own plain-text line to auto-linkify.
- Claude often returns JSON wrapped in ` ```json ``` ` — `study-pack.ts` strips fences + recovers from truncation.
