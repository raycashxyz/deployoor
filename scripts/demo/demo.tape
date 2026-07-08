Output assets/brand/dist/demo.gif

Set Shell "bash"
Set FontSize 17
Set Width 1400
Set Height 820
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 35ms

Hide
Type "cd examples/hardhat"
Enter
Sleep 400ms
Show

# --- 1. Project layout: Hardhat artifacts, no deployers/deployments yet ---
Type "# Hardhat project — compiled artifacts, not yet wired to deployoor"
Enter
Sleep 600ms

Type "ls -1"
Enter
Sleep 1500ms

Type "ls artifacts/contracts/Counter.sol/"
Enter
Sleep 2000ms

Type "test ! -d deployers && echo 'no deployers/ yet' || echo deployers exists"
Enter
Sleep 1500ms

# --- 2. compile → @deployoor/hardhat generates typed deployers ---
Type "# hardhat compile → typed deployers generated from artifacts/"
Enter
Sleep 600ms

Type "pnpm exec hardhat compile"
Enter
Sleep 8s

Type "ls deployers/"
Enter
Sleep 1500ms

Type "sed -n '1,14p' deployers/Counter.ts"
Enter
Sleep 3500ms

# --- 3. deploy → deployments/ record appears on disk ---
Type "# deploy to local anvil — writes deployments/<chain>/Counter.json"
Enter
Sleep 600ms

Type "pnpm run deploy"
Enter
Sleep 12s

Type "find deployments -name '*.json'"
Enter
Sleep 2000ms

Type "sed -n '1,18p' deployments/*/Counter.json"
Enter
Sleep 4000ms

# --- 4. idempotent re-run: no second transaction ---
Type "# same command again — returns recorded contract, no tx"
Enter
Sleep 600ms

Type "pnpm run deploy"
Enter
Sleep 8s
