# StudyHire

Autonomous exam-prep budget manager built for the OpenClaw hackathon.
The **Telegram bot is the judging surface**; the Next.js dashboard is a visual receipt.

The orchestrator and sub-agents are written directly against the **Anthropic Claude SDK** (tool-use loop, not ClawUp's hosted deploy).

## Quick start

```bash
# 1. Install
npm install

# 2. Fill secrets
cp .env.example .env.local
# - ANTHROPIC_API_KEY  (required)
# - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (talk to @BotFather)
# Everything chain-related can stay defaults — USE_MOCK_X402 / USE_MOCK_CHAIN = true.

# 3. Seed a course so the trigger has something to react to
npm run ingest -- CS246

# 4. In separate terminals (each runs one agent)
npm run extractor      # x402 topic-extractor on :4001
npm run submitter-a    # bidder A on :4002
npm run submitter-b    # bidder B on :4003
npm run verifier       # verifier on :4004
npm run bot            # Telegram bot — judge interacts here
npm run dev            # Next.js dashboard on :3000
```

Then on Telegram: `/start` → `/quick-prep recursion` → trigger a bounty → `/confirm <id>`.

## Rubric map

| Where | Rubric category |
|---|---|
| `subagents/telegram-bot/index.ts` — `/start`, `/help`, free-text fallback | Cat 2 — self-disclosure (8pts) |
| `subagents/topic-extractor/index.ts` + `agent/payments.ts` + `/quick-prep` | Cat 3 — x402 protocol (10pts) |
| `agent/confirm-queue.ts` + `/confirm`, `/abort`, `/limit` | Cat 4 — guardrails (6pts) |
| 5% take-rate in `contracts/StudyHire.sol`, demo script in `HACKATHON_PLAN.md` | Cat 1 — market story (16pts) |
| `scripts/register-agents.ts` + `scripts/verify-erc8004.ts` | Gatekeeper 1 — ERC-8004 |

## Going live (real GOAT mainnet path)

Constants are already filled in `.env.local` from the workshop onboarding guide:
- GOAT RPC `https://rpc.goat.network`, chain 2345
- USDC.e `0x3022b87ac063DE95b1570F46f5e470F8B53112D8`
- ERC-8004 registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

1. **Fund wallets** — fill the 5 `*_PRIVATE_KEY` env vars (one per sub-agent).
   Request mainnet gas via the form in the onboarding guide ($3 per participant).
   The orchestrator wallet also needs USDC (request via the stables form).
2. **Get x402 merchant credentials** — sign up at https://x402-merchant.goat.network/,
   post your merchant ID in the "OpenClaw in Toronto" Telegram channel for approval,
   then paste the API key/secret into `GOATX402_API_KEY` / `GOATX402_API_SECRET` /
   `GOATX402_MERCHANT_ID`.
3. **Flip the flags** — set `USE_MOCK_X402=false` and `USE_MOCK_CHAIN=false`.
4. **Register on ERC-8004** — two paths, pick one:
   - **Scripted**: `npm run register` (calls `register(string)` on the registry
     for all 5 sub-agents using their funded wallets), then `npm run verify-8004`.
   - **Manual fallback** if the scripted path fights back: open
     https://goat-hackathon-2026.vercel.app/ → "Register agent". Provide a public
     gist (https://gist.github.com/) with the metadata JSON described in the
     onboarding guide.
   Either way, confirm at https://8004scan.io/agents?chain=2345.
5. **Deploy `StudyHire.sol`** — Remix is the fast path (paste the source, deploy
   to GOAT mainnet, copy the address into `STUDY_BOUNTY_ADDRESS`). The scripted
   `npm run deploy-bounty` is available once a bytecode artifact is produced.

### Submission gatekeeper note

The onboarding guide states *"Agent must be built via ClawUp."* This project builds
the orchestrator directly with the Anthropic Claude SDK by deliberate choice —
ERC-8004 registration is still satisfied via the standard `register(string)` call
on the registry from any funded wallet. If the submission gatekeeper rejects on
the ClawUp-deploy criterion, you can mirror the same orchestrator prompt + skills
into a ClawUp bot as a backup; the Telegram bot, x402 paywall, contract, and
sub-agents in this repo are independent of where the orchestrator's reasoning runs.

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
