#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseLine, ParseError } from "./parser.js";
import { loadManifest, manifestPathFor, validateLine } from "./validate.js";
import type { Diagnostic } from "./model.js";

async function main(): Promise<void> {
  const [command = "check", target = "decks"] = process.argv.slice(2);
  if (command !== "check") {
    console.error("Usage: dln check [file-or-directory]");
    process.exitCode = 2;
    return;
  }

  const files = await collectLines(path.resolve(target));
  if (files.length === 0) {
    console.error(`No .dln files found under ${target}`);
    process.exitCode = 2;
    return;
  }

  const diagnostics: Diagnostic[] = [];
  for (const file of files) {
    try {
      const document = parseLine(await readFile(file, "utf8"), path.relative(process.cwd(), file));
      const manifest = await loadManifest(manifestPathFor(file));
      diagnostics.push(...validateLine(document, manifest));
    } catch (error) {
      if (error instanceof ParseError) diagnostics.push(error.toDiagnostic());
      else diagnostics.push({ source: path.relative(process.cwd(), file), message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) {
      console.error(`${diagnostic.source}${diagnostic.line ? `:${diagnostic.line}` : ""}: ${diagnostic.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`✓ ${files.length} DLN line${files.length === 1 ? "" : "s"} valid`);
}

async function collectLines(target: string): Promise<string[]> {
  const info = await stat(target);
  if (info.isFile()) return target.endsWith(".dln") ? [target] : [];
  const output: string[] = [];
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) output.push(...await collectLines(child));
    else if (entry.isFile() && entry.name.endsWith(".dln")) output.push(child);
  }
  return output.sort();
}

await main();
