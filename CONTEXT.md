# StudyHire — Session Context

Use this file to get a new Claude session up to speed on exactly where this project stands.

---

## What this project is

**StudyHire** is an autonomous exam-prep budget manager built for the OpenClaw hackathon (Toronto, May 26 2026).

- The **Telegram bot** is the judging surface — judges interact exclusively through it.
- The **Next.js dashboard** (`npm run dev`, port 3000) is a visual receipt only — real-time SSE activity stream.
- The **orchestrator** is a Claude (Anthropic SDK) tool-use loop — NOT ClawUp (ClawUp stopped working day-of).
- Everything runs on **GOAT mainnet** (chain 2345, RPC `https://rpc.goat.network`).

Hackathon submission deadline: **5:45 PM today (May 26 2026)** at `https://bit.ly/openclaw-hackathon-submission`

---

## Rubric map

| Category | Points | Where it lives |
|---|---|---|
| Cat 1 — Market story / take-rate | 16pts | 5% take-rate in `contracts/StudyHire.sol`, pitch in README + `/start` |
| Cat 2 — Self-disclosure | 8pts | `/start`, `/help`, free-text fallback in `subagents/telegram-bot/index.ts` |
| Cat 3 — x402 protocol | 10pts | `/quickprep <topic>` → `subagents/topic-extractor/index.ts` + `agent/payments.ts` |
| Cat 4 — Guardrails | 6pts | `/run` → triggers orchestrator in-process → confirm queue → Telegram `/confirm <id>` |
| Gatekeeper 1 — ERC-8004 | required | `scripts/register-agents.ts` + `scripts/verify-erc8004.ts` |

---

## Architecture

```
Telegram chat (judge)
       │
       ├─ /start, /help      → SELF_DESCRIPTION (Cat 2)
       ├─ /quickprep <topic> → payAndFetch → topic-extractor :4001 (Cat 3)
       ├─ /run [prompt]      → runOrchestrator() in-process (Cat 4)
       │       ↓
       │   orchestrator (Claude tool-use loop)
       │   ├─ x402_extract_topics → topic-extractor
       │   └─ propose_bounty → confirm-queue → Telegram /confirm prompt
       └─ /confirm, /abort   → confirm-queue.confirm/abort
```

**Key architectural note:** The orchestrator runs INSIDE the bot process (via `/run` command).
This is how they share the in-memory activity bus — if you run `npm run orchestrator` as a
separate process, the /confirm Telegram notification will NOT fire. Always trigger via `/run`.

---

## Key files

| File | What it does |
|---|---|
| `subagents/telegram-bot/index.ts` | Telegram bot — judging surface. Commands: /start /help /quickprep /run /status /balance /addcourse /listcourses /confirm /abort /limit |
| `subagents/topic-extractor/index.ts` | Express on :4001, x402 paywall, calls Claude for 5 exam subtopics |
| `subagents/_lib/study-pack.ts` | Claude-powered study pack generator |
| `subagents/verifier/index.ts` | Express on :4004, scores study packs, picks winner |
| `agent/orchestrator.ts` | Claude tool-use loop — list_tracked_courses, x402_extract_topics, propose_bounty |
| `agent/loop.ts` | Generic Anthropic tool-use runner (runAgent) |
| `agent/payments.ts` | x402 client — real USDC transfer path + mock fabrication path |
| `agent/x402-server.ts` | Express middleware for x402 paywall using goatx402-sdk-server |
| `agent/confirm-queue.ts` | Pending action store, 5-min TTL, confirm(id)/abort(id) |
| `agent/state.ts` | Process-global agent state (spending limit, courses, totals) |
| `agent/activity.ts` | Process-global event bus (SSE feed + Telegram push) |
| `agent/registry.ts` | ERC-8004 register/verify on GOAT mainnet |
| `agent/bounty-client.ts` | Posts bounties to StudyHire.sol (ABI matches contract exactly) |
| `agent/wallet.ts` | viem wallet helpers |
| `contracts/StudyHire.sol` | On-chain escrow, 5% take-rate (TAKE_BPS=500) |
| `lib/env.ts` | Loads .env.local then .env via explicit dotenv config() calls |
| `lib/llm.ts` | Lazy Anthropic client, LLM cache, complete()/textOf()/toolCallsOf() |
| `scripts/register-agents.ts` | Registers all 5 agents on ERC-8004 |
| `scripts/deploy-bounty.ts` | Scripted deploy (Remix is faster — see below) |

---

## Environment (.env.local — DO NOT COMMIT)

```
ANTHROPIC_API_KEY=              ← MUST FILL — get from console.anthropic.com
TELEGRAM_BOT_TOKEN=8754220098:AAHsv0W8wgLHkM_YZOvnfgU0OD3DLuJZfCs
TELEGRAM_CHAT_ID=8797668706
SPENDING_LIMIT_USD=5
GOAT_RPC_URL=https://rpc.goat.network
GOAT_CHAIN_ID=2345
USDC_ADDRESS=0x3022b87ac063DE95b1570F46f5e470F8B53112D8
ERC8004_REGISTRY_ADDRESS=0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
ORCHESTRATOR_PRIVATE_KEY=0x9b7531ce579fcc69f865728b67b02c5751ae521a509eedc4e9f8587f714a9091
TOPIC_EXTRACTOR_PRIVATE_KEY=0x648ea0c5222376a31c6196195fa449e437c59dd5892f5c6dd83206e5442fde24
SUBMITTER_A_PRIVATE_KEY=0xf156b88ce612a24bd60ffc2cef43ddbe21e2e80e545f40192156833c49ffc6cd
SUBMITTER_B_PRIVATE_KEY=0xb8b3979462853331c26cd0cec669ddfaccc56bc538ac285c30975968ca846174
VERIFIER_PRIVATE_KEY=0x6a41948aab75ab44a5641d9ea0869a3fb6e9c96b361e187c2b94f60e164f2aad
GOATX402_API_URL=https://x402-merchant.goat.network
GOATX402_API_KEY=              ← fill after merchant portal approved
GOATX402_API_SECRET=           ← fill after merchant portal approved
GOATX402_MERCHANT_ID=studyhire
X402_TOPIC_EXTRACTOR_URL=http://localhost:4001
X402_TOPIC_EXTRACTOR_PRICE_USD=0.10
STUDY_BOUNTY_ADDRESS=          ← fill after deploying StudyHire.sol
USE_MOCK_X402=true             ← flip to false once x402 credentials in
USE_MOCK_CHAIN=true            ← flip to false once wallets funded
```

### Agent wallet addresses
- ORCHESTRATOR:      `0x9cA4c6A53A7438d5A10D496e36BBeC352120d393`
- TOPIC_EXTRACTOR:   `0xA4edd279559d4ECb15745e669297129EDe56A24b`
- SUBMITTER_A:       `0xB0cb245E5C17d8b7811b74393056E619a0F63aaE`
- SUBMITTER_B:       `0xAb6bB4f4B59470c97100c0469d181C5978639941`
- VERIFIER:          `0xf32696BDbb7346bc5c7ECC718310Cb3e07E98972`

---

## Current status (session 3 — May 26 2026)

### Done ✅
- [x] Full TypeScript project — `npm run typecheck` passes with 0 errors
- [x] Telegram bot confirmed working — /start returns SELF_DESCRIPTION
- [x] All commands use no-hyphen form (quickprep, addcourse, listcourses)
- [x] x402 paywall — mock mode (USE_MOCK_X402=true) + live path (goatx402-sdk-server verified)
- [x] Claude tool-use orchestrator with spending gate + confirm queue
- [x] `/run [prompt]` command added to bot — triggers orchestrator IN-PROCESS so /confirm Telegram notifications fire correctly
- [x] StudyHire.sol (5% take-rate) — ABI in bounty-client.ts matches the contract exactly
- [x] ERC-8004 registration + verify scripts ready
- [x] Next.js dashboard with SSE activity stream
- [x] 5 agent wallets generated, saved to .env.local
- [x] .env.local created with all known values
- [x] npm install complete (all deps including goatx402-sdk-server)
- [x] Dashboard typo fixed: /quick-prep → /quickprep
- [x] CONTEXT.md updated

### IMMEDIATE — do this right now 🔴
1. **Add `ANTHROPIC_API_KEY` to `.env.local`**
   - Go to https://console.anthropic.com/ → API keys → Create
   - Paste the key as `ANTHROPIC_API_KEY=sk-ant-...` in `.env.local`
   - Without this: /quickprep and /run both fail with "ANTHROPIC_API_KEY not set"

2. **Start in two terminals:**
   ```
   npm run extractor   # topic-extractor on :4001
   npm run bot         # Telegram bot
   ```
   Optional visual receipt:
   ```
   npm run dev         # Next.js dashboard on :3000
   ```

3. **Test Cat 2 right now** (no API key needed):
   - Send `/start` to your bot → expect full SELF_DESCRIPTION

4. **Test Cat 3 once API key is in:**
   - Send `/quickprep recursion` → expect x402 mock payment + subtopic list

5. **Test Cat 4 once API key is in:**
   - Send `/addcourse CS246` (optional, orchestrator has a fallback)
   - Send `/run` → orchestrator proposes $25 bounty → you receive "⚠️ HIGH-VALUE ACTION" with id
   - Send `/confirm <id>` → bounty executes

### Waiting on (blocked by external)
- [ ] **Gas tokens** — GOAT team sending to orchestrator `0x9cA4c6A53A7438d5A10D496e36BBeC352120d393`
- [ ] **USDC stables** — GOAT team sending
- [ ] **x402 merchant credentials** — applied at `https://x402-merchant.goat.network/` as `studyhire`

### When gas arrives
1. **Deploy StudyHire.sol via Remix** (fastest):
   - Go to https://remix.ethereum.org
   - New file → paste `contracts/StudyHire.sol` → compile (0.8.24)
   - Deploy tab → "Injected Provider" → switch MetaMask to GOAT mainnet (chain 2345)
   - Constructor args:
     - `_usdc`:      `0x3022b87ac063DE95b1570F46f5e470F8B53112D8`
     - `_verifier`:  `0xf32696BDbb7346bc5c7ECC718310Cb3e07E98972`
     - `_treasury`:  `0x9cA4c6A53A7438d5A10D496e36BBeC352120d393`
   - Copy deployed address → add to `.env.local` as `STUDY_BOUNTY_ADDRESS=0x...`

2. **Register ERC-8004 agents** (each wallet needs ~0.01 GOAT for gas):
   ```
   npm run register
   npm run verify-8004
   ```
   Then visit https://8004scan.io/agents?chain=2345 to confirm visually.

3. **Set `USE_MOCK_CHAIN=false`** in `.env.local`, restart bot.

### When x402 credentials arrive
1. Fill `GOATX402_API_KEY`, `GOATX402_API_SECRET` in `.env.local`
2. Set `USE_MOCK_X402=false`
3. Restart extractor + bot → now `/quickprep` shows a REAL on-chain USDC payment tx

### Hackathon submission (5:45 PM deadline)
- URL: **https://bit.ly/openclaw-hackathon-submission**
- GitHub repo: https://github.com/manpreetd/StudyHire

---

## Demo script (90 seconds)

| Step | Action | Rubric |
|---|---|---|
| 1 | Open browser at `localhost:3000` (dashboard) | — |
| 2 | Send `/start` to Telegram bot | Cat 2 ✅ |
| 3 | Send `/quickprep recursion` | Cat 3 ✅ |
| 4 | Send `/addcourse CS246` | — |
| 5 | Send `/run` | Cat 4 — triggers confirm request |
| 6 | Send `/confirm <id>` | Cat 4 ✅ — bounty executes |
| 7 | Point at dashboard showing all events | Cat 1 pitch |
| 8 | "5% take-rate in StudyHire.sol. $4B tutoring market." | Cat 1 ✅ |

---

## Key past fixes (don't redo)
- Bot token was revoked — ClawUp was consuming updates. Current token is in .env.local.
- `lib/env.ts` calls `config({ path: ".env.local" })` explicitly — tsx doesn't auto-load.
- ERC-8004 ABI is `register(string)` only (one arg).
- Telegram commands: no hyphens — `/quickprep` not `/quick-prep`.
- ClawUp non-functional — orchestrator uses Anthropic SDK directly.
- Orchestrator and bot must share a process for /confirm notifications — use `/run` in the bot.
