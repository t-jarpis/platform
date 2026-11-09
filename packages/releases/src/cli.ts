#!/usr/bin/env node
/**
 * Schrijft het releaselog voor de build: de laatste commits met hun trailers als JSON (nieuwste eerst).
 * Gebruik in de deploy-workflow, na een checkout met genoeg geschiedenis (fetch-depth):
 *   release-log --out apps/api/release-log.json [--max 300] [--note-key Release-note] [--public-key Public-note]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { NOTE_TRAILER, PUBLIC_TRAILER, gitLogFormat, parseGitLog } from "./log.js";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    max: { type: "string", default: "300" },
    "note-key": { type: "string", default: NOTE_TRAILER },
    "public-key": { type: "string", default: PUBLIC_TRAILER },
  },
});
const max = Number(values.max);
const key = /^[A-Za-z][A-Za-z-]{0,40}$/;
if (!values.out || !Number.isInteger(max) || max < 1 || !key.test(values["note-key"]) || !key.test(values["public-key"])) {
  console.error("Gebruik: release-log --out <bestand> [--max 300] [--note-key Release-note] [--public-key Public-note]");
  process.exit(1);
}
const output = execFileSync("git", ["log", `-${max}`, `--format=${gitLogFormat(values["note-key"], values["public-key"])}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const log = parseGitLog(output);
writeFileSync(values.out, JSON.stringify(log));
console.warn(`${log.length} commits in ${values.out}`);
