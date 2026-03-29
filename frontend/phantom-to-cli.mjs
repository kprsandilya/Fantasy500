import bs58 from "bs58";
import { writeFileSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";

const homedir = process.env.HOME || process.env.USERPROFILE;
const outPath = join(homedir, ".config", "solana", "id.json");

const rl = createInterface({ input: process.stdin, output: process.stderr });

rl.question("Paste your Phantom private key (base58): ", (key) => {
  rl.close();
  const trimmed = key.trim();

  let bytes;
  try {
    bytes = bs58.decode(trimmed);
  } catch {
    console.error("ERROR: Invalid base58 string.");
    process.exit(1);
  }

  if (bytes.length !== 64) {
    console.error(
      `ERROR: Expected 64 bytes (got ${bytes.length}). Make sure you exported the full private key from Phantom.`
    );
    process.exit(1);
  }

  if (existsSync(outPath)) {
    const backupPath = outPath.replace("id.json", "id.json.bak");
    copyFileSync(outPath, backupPath);
    console.error(`Backed up existing keypair to: ${backupPath}`);
  }

  writeFileSync(outPath, JSON.stringify(Array.from(bytes)));
  console.error(`Keypair written to: ${outPath}`);

  const pubkeyBytes = bytes.slice(32);
  const pubkey = bs58.encode(pubkeyBytes);
  console.error(`Public key (your wallet address): ${pubkey}`);
});
