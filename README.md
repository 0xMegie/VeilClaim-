# VeilClaim

Prove that a provider-attested private insurance claim satisfies public policy rules, and consume that claim exactly once, without publishing the claim amount, service date, or claimant identity.

```
private provider-attested claim -> Midnight proof -> replay-safe public authorization receipt
```

> Status: scaffold. `submitClaim` fails closed until the core proof path lands.

## Layout

| Path | What |
|------|------|
| `contract/` | Compact contract, witnesses, and Vitest suite running the real compiled circuits |
| `api/` | Platform-agnostic TypeScript API (deploy, join, circuit calls, public state) |
| `ui/` | React + Vite claimant app (Lace wallet, two screens) |
| `proof-server/` | Local Midnight proof server |

## Prerequisites

- Bun 1.3+ and Node.js 24 (`.nvmrc`)
- Compact toolchain, compiler **0.31.1** (matches `compact-runtime` 0.16.0 / Midnight.js 4.1.1)
  ```bash
  compact update 0.31.1
  ```
- Docker (proof server)
- Lace wallet with Midnight Preprod enabled

## Commands

```bash
bun install
bun run compact        # compile contract + proving keys
bun run compact:fast   # compile without ZK keys (quick iteration)
bun run test           # contract tests
bun run typecheck
bun run proof-server   # local proof server on :6300
bun run dev            # UI on :3000 (needs a full `bun run compact` first)
```

## Public vs private state

| Public ledger | Private (witness only) |
|---------------|------------------------|
| policies, approved providers + attestation keys | billed amount, category, service epoch |
| consumed claim nullifiers | holder secret, claim nonce |
| claim receipts (policy id + nullifier) | provider attestation signature |
| accepted claim count | claimant identity |
