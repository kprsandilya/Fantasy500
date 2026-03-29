#!/usr/bin/env bash
set -euo pipefail

# Fantasy500 — deploy Anchor program to devnet + fund deployer
# Prerequisites:
#   1. Solana CLI: solana --version
#   2. Anchor CLI: anchor --version  (install: cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install 0.31.1 && avm use 0.31.1)
#   3. Deployer keypair: ~/.config/solana/id.json (solana-keygen new)
#   4. Devnet SOL: go to https://faucet.solana.com, paste your deployer address, airdrop ~3 SOL

cd "$(dirname "$0")/.."

echo "=== Fantasy500 Devnet Deploy ==="
echo ""

# Ensure devnet
solana config set --url devnet

DEPLOYER=$(solana address)
BALANCE=$(solana balance --lamports | awk '{print $1}')
echo "Deployer:  $DEPLOYER"
echo "Balance:   $(echo "scale=4; $BALANCE / 1000000000" | bc) SOL"
echo ""

if [ "$BALANCE" -lt 2000000000 ]; then
  echo "WARNING: You need at least 2 SOL to deploy. Visit https://faucet.solana.com"
  echo "         Paste address: $DEPLOYER"
  exit 1
fi

echo "Building program..."
anchor build --arch sbf

# Anchor 0.31 may place artifacts under programs/<name>/target/deploy.
if [ -f "programs/fantasy_league/target/deploy/fantasy_league.so" ]; then
  mkdir -p target/deploy
  cp "programs/fantasy_league/target/deploy/fantasy_league.so" "target/deploy/"
  cp "programs/fantasy_league/target/deploy/fantasy_league-keypair.json" "target/deploy/"
fi

echo ""
echo "Deploying to devnet..."
anchor deploy --provider.cluster devnet

# Extract the deployed program ID
PROGRAM_ID=$(solana-keygen pubkey target/deploy/fantasy_league-keypair.json 2>/dev/null || echo "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS")
echo ""
echo "Program ID: $PROGRAM_ID"
echo ""

# Update .env if the program ID changed
if grep -q "^PROGRAM_ID=" .env; then
  sed -i '' "s/^PROGRAM_ID=.*/PROGRAM_ID=$PROGRAM_ID/" .env
  echo "Updated PROGRAM_ID in .env"
else
  echo "PROGRAM_ID=$PROGRAM_ID" >> .env
  echo "Added PROGRAM_ID to .env"
fi

echo ""
echo "=== Done! ==="
echo "  1. Restart server:  cargo run -p server"
echo "  2. Open app, go to a league → On-Chain tab"
echo "  3. Click Initialize Escrow → Pay Buy-in → Distribute Payout"
echo ""
echo "  Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
