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
| Cat 1 — Market story / take-rate | 16pts | 5% take-rate in `contracts/StudyHire.sol`, pitch in README |
| Cat 2 — Self-disclosure | 8pts | `/start`, `/help`, free-text fallback in `subagents/telegram-bot/index.ts` |
| Cat 3 — x402 protocol | 10pts | `/quickprep <topic>` → `subagents/topic-extractor/index.ts` + `agent/payments.ts` |
| Cat 4 — Guardrails | 6pts | `agent/confirm-queue.ts` + `/confirm`, `/abort`, `/limit` commands |
| Gatekeeper 1 — ERC-8004 | required | `scripts/register-agents.ts` + `scripts/verify-erc8004.ts` |

---

## Architecture

```
Telegram chat (judge)
       │
       ▼
telegram-bot ─────► confirm-queue ◄── activity bus ─► Next.js dashboard (SSE)
       │                    ▲
       ▼                    │
orchestrator ────► postBounty (StudyHire.sol on GOAT)
(Claude tool-use)               │
       │                        ▼
       ├──► x402 → topic-extractor      submitter-a / submitter-b
       │                                          │
       ▼                                          ▼
   payAndFetch                              verifier ─► declareWinner
```

---

## Key files

| File | What it does |
|---|---|
| `subagents/telegram-bot/index.ts` | Telegram bot — the judging surface. Commands: /start /help /quickprep /status /balance /addcourse /listcourses /confirm /abort /limit |
| `subagents/topic-extractor/index.ts` | Express on :4001, x402 paywall, calls Claude to extract 5 exam subtopics as JSON |
| `subagents/_lib/study-pack.ts` | Claude-powered study pack generator used by submitter-a and submitter-b |
| `subagents/verifier/index.ts` | Express on :4004, scores competing study packs, picks winner |
| `agent/orchestrator.ts` | Claude tool-use loop — list_tracked_courses, x402_extract_topics, propose_bounty |
| `agent/loop.ts` | Generic Anthropic tool-use runner (runAgent) |
| `agent/payments.ts` | x402 client — real path does USDC transfer + retry with headers; mock path fabricates receipt |
| `agent/x402-server.ts` | Express middleware for x402 paywall using goatx402-sdk-server |
| `agent/confirm-queue.ts` | Pending action store, 5-min TTL, confirm(id)/abort(id) |
| `agent/state.ts` | Process-global agent state (spending limit, courses, totals) |
| `agent/activity.ts` | Process-global event bus (SSE feed + Telegram push) |
| `agent/registry.ts` | ERC-8004 register/verify on GOAT mainnet |
| `agent/bounty-client.ts` | Posts bounties to StudyHire.sol |
| `agent/wallet.ts` | viem wallet helpers |
| `contracts/StudyHire.sol` | On-chain escrow, 5% take-rate (TAKE_BPS=500) |
| `lib/env.ts` | Loads .env.local then .env via explicit dotenv config() calls |
| `lib/llm.ts` | Lazy Anthropic client, LLM cache, complete()/textOf()/toolCallsOf() |
| `scripts/register-agents.ts` | Registers all 5 agents on ERC-8004 |
| `scripts/deploy-bounty.ts` | Deploys StudyHire.sol (Remix is faster for demo) |
| `ingest/d2l-fetch.ts` | Seeded course cache under cache/ |

---

## Environment (.env.local — DO NOT COMMIT)

```
ANTHROPIC_API_KEY=              ← STILL EMPTY — needs to be filled
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
GOATX402_MERCHANT_ID=studyhire  ← fill after merchant portal approved
X402_TOPIC_EXTRACTOR_URL=http://localhost:4001
X402_TOPIC_EXTRACTOR_PRICE_USD=0.10
STUDY_BOUNTY_ADDRESS=          ← fill after deploying StudyHire.sol
USE_MOCK_X402=true             ← flip to false once x402 credentials in
USE_MOCK_CHAIN=true            ← flip to false once wallets funded
```

### Agent wallet addresses (orchestrator is the main spending wallet)
- ORCHESTRATOR:      `0x9cA4c6A53A7438d5A10D496e36BBeC352120d393`
- TOPIC_EXTRACTOR:   `0xA4edd279559d4ECb15745e669297129EDe56A24b`
- SUBMITTER_A:       `0xB0cb245E5C17d8b7811b74393056E619a0F63aaE`
- SUBMITTER_B:       `0xAb6bB4f4B59470c97100c0469d181C5978639941`
- VERIFIER:          `0xf32696BDbb7346bc5c7ECC718310Cb3e07E98972`

---

## Current status (as of session end)

### Done
- [x] Full TypeScript project scaffolded and typechecking clean
- [x] Telegram bot running and confirmed working (`/start` returns full self-description)
- [x] All commands renamed to no-hyphen (quickprep, addcourse, listcourses) — Telegram tokenizer bug fix
- [x] x402 paywall wired with both mock and live paths
- [x] Claude tool-use orchestrator with spending gate + confirm queue
- [x] StudyHire.sol (5% take-rate escrow)
- [x] ERC-8004 registration script
- [x] Next.js dashboard with SSE activity stream
- [x] 5 agent wallets generated and saved to .env.local
- [x] All files renamed from StudyBounty → StudyHire

### In progress / pending
- [ ] **ANTHROPIC_API_KEY** — needs to be added to .env.local to enable Claude calls
- [ ] **Gas tokens** — submitted form using orchestrator address `0x9cA4c6A53A7438d5A10D496e36BBeC352120d393`, waiting for GOAT team to send
- [ ] **Stables (USDC)** — submitted form, waiting for GOAT team to send
- [ ] **x402 merchant portal** — applied at `https://x402-merchant.goat.network/` as merchant ID `studyhire`, waiting for approval + API credentials
- [ ] **Flip USE_MOCK_X402=false and USE_MOCK_CHAIN=false** — blocked on gas + stables + x402 credentials
- [ ] **Register agents on ERC-8004** — `npm run register` (blocked on gas)
- [ ] **Deploy StudyHire.sol** via Remix → paste address into STUDY_BOUNTY_ADDRESS
- [ ] **Test /quickprep recursion** end-to-end on Telegram (blocked on ANTHROPIC_API_KEY + extractor running)
- [ ] **Submit hackathon form** by 5:45 PM: `https://bit.ly/openclaw-hackathon-submission`

---

## How to run

```bash
npm install

# In separate terminals:
npm run extractor      # x402 topic-extractor on :4001
npm run submitter-a    # bidder A on :4002
npm run submitter-b    # bidder B on :4003
npm run verifier       # verifier on :4004
npm run bot            # Telegram bot (main judging surface)
npm run dev            # Next.js dashboard on :3000
```

## Key past fixes (don't redo these)
- Bot token was revoked and replaced — ClawUp was consuming all Telegram updates. New token is in .env.local.
- `lib/env.ts` explicitly calls `config({ path: ".env.local" })` — tsx doesn't auto-load it like Next.js does.
- ERC-8004 ABI is `register(string)` only (one arg, not two).
- Telegram commands use no hyphens — `/quickprep` not `/quick-prep` (hyphens break Telegram's tokenizer).
- ClawUp is non-functional — orchestrator is built directly with Anthropic SDK. Do not attempt to use ClawUp.
