import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { languageFromExt } from "./lang";
import { stripComments } from "./strip";
import { maskSecretsFn } from "./secrets";
import { chunkByLines, limit, sha256Hex } from "./utils";
import type { FileMeta } from "./bundle";
import type { PastaConfig } from "./config";

export async function processUris(opts: {
  uris: vscode.Uri[];
  cfg: PastaConfig;
  rootFs: string;
  ignoreSizeLimit?: boolean; 
}): Promise<{
  metas: FileMeta[];
  blocks: string[];
  skipped: { path: string; reason: string }[];
  errors: string[];
}> {
  const { uris, cfg, rootFs, ignoreSizeLimit } = opts;

  const metas: FileMeta[] = [];
  const blocks: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const errors: string[] = [];

  await Promise.all(
    uris.map((u) => limit(async () => {
      try {
        const st = await vscode.workspace.fs.stat(u);
        if (st.type & vscode.FileType.Directory) {
          return;
        }

        const isOversized = st.size > cfg.maxBytesPerFile;
        if (isOversized && !cfg.splitOversizedFiles && !ignoreSizeLimit) {
          skipped.push({ path: u.fsPath, reason: `size>${cfg.maxBytesPerFile}` });
          return;
        }

        let text = await fs.readFile(u.fsPath, "utf8");

        text = text.replace(/\r\n/g, "\n");
        if (cfg.normalizeTabsToSpaces) {
          text = text.replace(/\t/g, "  ");
        }

        const lang = languageFromExt(path.extname(u.fsPath).toLowerCase());
        if (cfg.stripMode !== "none") {
          text = stripComments(text, lang, cfg.stripMode, cfg.stripDocstringsInPython);
        }
        if (cfg.maskSecrets) {
          text = maskSecretsFn(text);
        }
        text = text.replace(/[ \t]+$/gm, "");

        let rel = path
          .relative(rootFs, u.fsPath)
          .replaceAll("\\", "/");
        if (!rel) {
          rel = path.basename(u.fsPath);
        }

        if (isOversized && cfg.splitOversizedFiles) {
          const chunks = chunkByLines(text, cfg.oversizedChunkLines);
          const total = chunks.length;
          chunks.forEach((chunk, i) => {
            const lines = chunk.split("\n").length;
            const bytes = Buffer.byteLength(chunk, "utf8");
            const hash = sha256Hex(chunk);
            metas.push({
              rel: `${rel}#${i + 1}/${total}`,
              lang,
              lines,
              bytes,
              hash,
            });
            blocks.push(
              `=== FILE PART: ${rel} | CHUNK ${i + 1}/${total} | LINES:${lines} BYTES:${bytes} | LANG:${lang ?? "plain"} | HASH:sha256:${hash} ===
\`\`\`${lang ?? ""}
${chunk}
\`\`\`
=== END FILE PART ===

`
            );
          });
          return;
        }

        const lines = text.split("\n").length;
        const bytes = Buffer.byteLength(text, "utf8");
        const hash = sha256Hex(text);
        metas.push({ rel, lang, lines, bytes, hash });
        blocks.push(
          `=== FILE: ${rel} | LINES:${lines} BYTES:${bytes} | LANG:${lang ?? "plain"} | HASH:sha256:${hash} ===
\`\`\`${lang ?? ""}
${text}
\`\`\`
=== END FILE ===

`
        );
      } catch (e: any) {
        errors.push(`${u.fsPath}: ${e?.message ?? e}`);
      }
    }))
  );

  return { metas, blocks, skipped, errors };
}
