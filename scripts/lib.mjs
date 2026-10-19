// Shared helpers for the setup scripts (Node 18+, no dependencies).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import readline from "node:readline";
import path from "node:path";

export const DB_NAME = "ap-life-quest-db";
export const ITERATIONS = 10_000;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** Ask a question; with hidden=true the typed characters are not echoed. */
export function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => rl.output.write(muted ? (/[\r\n]/.test(s) ? "" : "*") : s);
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden; // the prompt has been written; hide what's typed next
  });
}

const isWin = process.platform === "win32";

const WRANGLER = path.resolve("node_modules", "wrangler", "bin", "wrangler.js");

/**
 * Runs wrangler through Node directly (no shell, so arguments with spaces/quotes — like SQL — arrive
 * intact on Windows too). Returns { status, stdout } (inherit = stream output to the terminal).
 */
export function wrangler(args, { input, inherit = false } = {}) {
  if (!existsSync(WRANGLER)) {
    console.error("✘ wrangler isn't installed here. Run: npm install");
    return { status: 1, stdout: "" };
  }
  const r = spawnSync(process.execPath, [WRANGLER, ...args], {
    input,
    encoding: "utf8",
    stdio: inherit ? ["inherit", "inherit", "inherit"] : [input ? "pipe" : "inherit", "pipe", "pipe"],
  });
  return { status: r.status ?? 1, stdout: (r.stdout ?? "") + (r.stderr ?? "") };
}

export function npm(args) {
  const r = spawnSync(isWin ? "npm.cmd" : "npm", args, { stdio: "inherit", shell: isWin });
  return r.status ?? 1;
}

/** Writes/updates KEY=value lines in .dev.vars (local secrets, git-ignored). */
export function setDevVar(key, value) {
  const file = ".dev.vars";
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith(`${key}=`)) : [];
  lines.push(`${key}=${value}`);
  writeFileSync(file, lines.join("\n") + "\n");
}

export async function setSecret(key, value, local) {
  if (local) {
    setDevVar(key, value);
    console.log(`✔ Saved ${key} to .dev.vars (local dev only).`);
    return true;
  }
  const r = wrangler(["secret", "put", key], { input: value });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(`✘ Could not set ${key}. Have you deployed once (npm run setup)?`);
    return false;
  }
  console.log(`✔ ${key} stored as an encrypted Cloudflare secret.`);
  return true;
}
