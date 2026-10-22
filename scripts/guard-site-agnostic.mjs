#!/usr/bin/env node
// Weigert sitecode in het platform: verwijzingen naar site-pakketten of domeinbegrippen van een site.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const cfg = JSON.parse(readFileSync(join(root, "guard.config.json"), "utf8"));
const terms = cfg.forbiddenTerms.map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
const scopes = cfg.forbiddenScopes;
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (cfg.ignore.includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!/\.(ts|tsx|js|mjs|cjs|json|md)$/.test(name)) continue;
    const text = readFileSync(path, "utf8");
    text.split("\n").forEach((line, i) => {
      for (const scope of scopes) if (line.includes(`${scope}/`)) problems.push(`${relative(root, path)}:${i + 1} verwijst naar site-scope ${scope}`);
      for (const re of terms) if (re.test(line)) problems.push(`${relative(root, path)}:${i + 1} bevat site-begrip "${line.match(re)[0]}"`);
    });
  }
}
for (const dir of cfg.scan) walk(join(root, dir));

if (problems.length) {
  console.error("Het platform mag niets weten van sites:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("Guard: geen sitecode gevonden.");
