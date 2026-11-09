import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_TOKENS, chartColor, missingTokens } from "./tokens.js";

const root = path.resolve(import.meta.dirname, "..");
const css = readFileSync(path.join(root, "admin.css"), "utf8");
const sources = readdirSync(path.join(root, "src")).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test.")).map((f) => readFileSync(path.join(root, "src", f), "utf8"));
const OWN = new Set(["--sw", "--heat"]);

describe("contract met het thema van de site", () => {
  it("admin.css leest precies de gedocumenteerde variabelen", () => {
    const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!).filter((v) => !OWN.has(v)));
    for (let i = 0; i < 4; i++) used.add(chartColor(i).slice(4, -1)); // reeksen in TimeChart
    expect([...used].sort()).toEqual([...REQUIRED_TOKENS].sort());
  });

  it("zet zelf geen variabelen behalve --sw en --heat", () => {
    const defined = [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(defined).toEqual([]);
    for (const src of sources) for (const m of src.matchAll(/"(--[a-z0-9-]+)"\s*:/g)) expect(OWN.has(m[1]!)).toBe(true);
  });

  it("bevat geen losse kleuren", () => {
    const hex = /#[0-9a-f]{3,8}\b/i, fn = /\b(rgb|rgba|hsl|hsla|oklch)\(/i;
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(hex);
    expect(css).not.toMatch(fn);
    for (const src of sources) { expect(src).not.toMatch(hex); expect(src).not.toMatch(fn); }
  });

  it("missingTokens noemt wat een thema mist", () => {
    const theme = REQUIRED_TOKENS.filter((t) => t !== "--chart-4").map((t) => `${t}: 1;`).join("\n");
    expect(missingTokens(`:root { ${theme} }`)).toEqual(["--chart-4"]);
  });
});
