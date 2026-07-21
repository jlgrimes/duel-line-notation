import type { ChainLink, Diagnostic, LineDocument, Step } from "./model.js";

export class ParseError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly line?: number,
  ) {
    super(message);
  }

  toDiagnostic(): Diagnostic {
    return {
      source: this.source,
      ...(this.line === undefined ? {} : { line: this.line }),
      message: this.message,
    };
  }
}

export function parseLine(text: string, source = "<input>"): LineDocument {
  const rows = text.split(/\r?\n/);
  let deck: string | undefined;
  let name: string | undefined;
  let start: string | undefined;
  let end: string | undefined;
  const steps: Step[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const lineNumber = index + 1;
    const raw = rows[index] ?? "";
    const line = raw.trim();
    if (line === "" || line.startsWith("//")) continue;

    const declaration = line.match(/^@(deck|line|start|end)\s+(.+)$/);
    if (declaration) {
      const [, kind, value] = declaration;
      if (kind === "deck") deck = singleDeclaration(deck, value!, kind, source, lineNumber);
      if (kind === "line") name = singleDeclaration(name, value!, kind, source, lineNumber);
      if (kind === "start") start = singleDeclaration(start, value!, kind, source, lineNumber);
      if (kind === "end") end = singleDeclaration(end, value!, kind, source, lineNumber);
      continue;
    }

    const chainStart = line.match(/^(\d+)\s+CHAIN\s*\{$/);
    if (chainStart) {
      const links: ChainLink[] = [];
      const stepLine = lineNumber;
      let closed = false;
      for (index += 1; index < rows.length; index += 1) {
        const childLineNumber = index + 1;
        const child = (rows[index] ?? "").trim();
        if (child === "" || child.startsWith("//")) continue;
        if (child === "}") {
          closed = true;
          break;
        }
        const link = child.match(/^CL(\d+)\s+(.+)$/);
        if (!link) {
          throw new ParseError("Expected a Chain Link such as `CL1 CARD#T => ...` or `}`.", source, childLineNumber);
        }
        links.push({ number: Number(link[1]), expression: link[2]!, line: childLineNumber });
      }
      if (!closed) throw new ParseError("Unclosed CHAIN block.", source, stepLine);
      steps.push({ kind: "chain", number: Number(chainStart[1]), links, line: stepLine });
      continue;
    }

    const action = line.match(/^(\d+)\s+(.+)$/);
    if (action) {
      steps.push({ kind: "action", number: Number(action[1]), expression: action[2]!, line: lineNumber });
      continue;
    }

    throw new ParseError("Unrecognized DLN statement.", source, lineNumber);
  }

  if (!deck) throw new ParseError("Missing `@deck` declaration.", source);
  if (!name) throw new ParseError("Missing `@line` declaration.", source);
  if (!start) throw new ParseError("Missing `@start` declaration.", source);
  if (!end) throw new ParseError("Missing `@end` declaration.", source);

  return { deck, name, start, end, steps, source };
}

function singleDeclaration(
  current: string | undefined,
  next: string,
  kind: string,
  source: string,
  line: number,
): string {
  if (current !== undefined) throw new ParseError(`Duplicate @${kind} declaration.`, source, line);
  return next.trim();
}
