# README demo — terminal-only storyboard

Yes — the full journey can be **100% terminal**: folder layout → Hardhat `artifacts/` → generated `deployers/` → deploy → `deployments/` JSON → idempotent re-run.

Uses `examples/hardhat` (real `@deployoor/hardhat` auto-generate on compile + filesystem deploy script).

## Record

```bash
brew install vhs    # terminal recorder
# anvil ships with Foundry
pnpm demo:record
```

`record.sh` starts **anvil** in the background, wipes `deployers/` and `deployments/` for a clean before/after, then runs VHS.

Output: `assets/brand/dist/demo.gif`

## Beat sheet (~60–75s)

| Scene | Command                                      | What the viewer learns                                          |
| ----- | -------------------------------------------- | --------------------------------------------------------------- |
| 1     | `ls -1`                                      | Normal Hardhat layout: `contracts/`, `artifacts/`, `scripts/`   |
| 2     | `ls artifacts/contracts/Counter.sol/`        | Compiled artifact JSON exists                                   |
| 3     | `test ! -d deployers`                        | No deployoor output yet                                         |
| 4     | `pnpm exec hardhat compile`                  | Plugin generates `deployers/` from artifacts                    |
| 5     | `ls deployers/` + `sed deployers/Counter.ts` | Typed `getOrDeployCounter` — not hand-written                   |
| 6     | `pnpm run deploy`                            | First run: on-chain deploy + `deployments/<chain>/Counter.json` |
| 7     | `find deployments` + `sed …/Counter.json`    | Plain JSON record: address, ABI, chain                          |
| 8     | `pnpm run deploy` again                      | Idempotent — “already recorded, no transaction”                 |

**One-line VO:**  
_“Compile your Hardhat project, get typed deployers, deploy once — your team imports the record everywhere.”_

## Optional second clip (Foundry + tevm tests)

Same idea in `examples/foundry`: `pnpm generate` → vitest with `contract.read` / `contract.write` on tevm. Good as a follow-up GIF for the testing story.

## Tips

- Trim `Sleep` values in `demo.tape` after a dry run if compile/deploy finish faster on your machine.
- If `hardhat compile` is slow on tape, pre-warm once (record.sh already builds) and lower the first compile `Sleep`.
- For README, prefer `demo-sm.gif` (auto-generated) — smaller file size.
