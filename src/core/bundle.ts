import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { sha256Hex, estimateTokens } from "../core/utils";

export interface FileMeta {
  rel: string;
  lang: string | null;
  lines: number;
  bytes: number;
  hash: string;
}

export function chunkBundles(
  contextHeader: string,
  blocks: string[],
  tokenBudget: number
): string[] {
  const parts: string[] = [];
  let current = "";

  const push = () => {
    if (current) {
      parts.push(current);
      current = "";
    }
  };

  // context d’abord
  if (estimateTokens(contextHeader) > tokenBudget) {
    const lines = contextHeader.split("\n");
    let acc = "";
    for (const ln of lines) {
      const test = acc + ln + "\n";
      if (estimateTokens(test) > tokenBudget) {
        parts.push(acc);
        acc = "";
      }
      acc += ln + "\n";
    }
    if (acc) {
      parts.push(acc);
    }
  } else {
    current += contextHeader + "\n";
  }

  for (const blk of blocks) {
    if (estimateTokens(current + blk) > tokenBudget && current) {
      push();
    }
    current += blk;
  }
  if (current) {
    push();
  }

  // Enrich headers
  for (let i = 0; i < parts.length; i++) {
    const hdr = `=== BUNDLE PART ${i + 1}/${
      parts.length
    } | TOKENS≈${estimateTokens(parts[i])} ===\n`;
    parts[i] =
      hdr +
      parts[i] +
      (i < parts.length - 1
        ? `\n=== CONTINUE IN PART ${i + 2}/${parts.length} ===\n`
        : "");
  }
  return parts;
}

export async function buildContextHeader(
  root: vscode.Uri,
  metas: FileMeta[],
  tree: string | null,
  goal: string,
  rules: { stripMode: string; maskSecrets: boolean },
  gitInfo?: { branch: string; head: string; dirty: "clean" | "dirty" | "n/a" }
): Promise<string> {
  const project = path.basename(root.fsPath);
  const osStr = `${os.platform()} ${os.arch()}`;
  const vs = vscode.version;
  const langSet = new Set(metas.map((m) => m.lang ?? "plain"));
  const langs = Array.from(langSet).sort().join(",");
  const totalFiles = metas.length;
  const totalLines = metas.reduce((a, m) => a + m.lines, 0);
  const totalBytes = metas.reduce((a, m) => a + m.bytes, 0);
  const merkle = sha256Hex(metas.map((m) => m.hash).join(""));

  const toc = metas
    .slice()
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map((m) => `- ${m.rel} (L:${m.lines} B:${m.bytes} H:${m.hash})`)
    .join("\n");

  const parts: string[] = [];
  parts.push("=== AI CONTEXT ===");
  parts.push(`Project: ${project} | OS: ${osStr} | VSCode: ${vs}`);
  if (gitInfo) {
    parts.push(
      `Git: branch=${gitInfo.branch} head=${gitInfo.head} ${gitInfo.dirty}`
    );
  } else {
    parts.push(`Git: branch=n/a head=n/a n/a`);
  }
  parts.push(`Langs: ${langs}`);
  parts.push(`Goal: ${goal || "n/a"}`);
  parts.push(
    `Rules: strip=${rules.stripMode} secrets=${rules.maskSecrets} eol=\\n`
  );
  parts.push(
    `Files: ${totalFiles} | Lines: ${totalLines} | Bytes: ${totalBytes}`
  );
  parts.push(`BUNDLE-HASH: merkle-sha256:${merkle}`);
  parts.push("=== END AI CONTEXT ===\n");
  if (tree) {
    parts.push("```text\n" + tree + "\n```");
  }
  parts.push("=== TABLE OF CONTENTS ===\n" + toc + "\n=== END TOC ===\n");
  return parts.join("\n");
}
