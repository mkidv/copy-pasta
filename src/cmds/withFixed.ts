import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { getConfig } from "../core/config";
import { buildTree } from "../core/fsTree";
import { stripComments } from "../core/strip";
import { maskSecretsFn } from "../core/secrets";
import { languageFromExt } from "../core/lang";
import { chunkBundles, buildContextHeader, FileMeta } from "../core/bundle";
import {
  estimateTokens,
  sha256Hex,
  commonRootDir,
  ensureDirPath,
} from "../core/utils";

export async function aiPasteWithFixedUris(
  uris: vscode.Uri[],
  opts?: { ignoreSizeLimit?: boolean; showSkipReport?: boolean }
) {
  const cfg = getConfig();
  const ignoreSize = !!opts?.ignoreSizeLimit;

  const baseDirs = uris.map((u) => ensureDirPath(u.fsPath));
  const rootFs = commonRootDir(baseDirs);
  const rootUri = vscode.Uri.file(rootFs);

  const goal =
    (await vscode.window.showInputBox({
      title: "Small goal (1-2 lines)",
      value: "Review & refactor selected files.",
    })) || "";

  const metas: FileMeta[] = [];
  const blocks: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const errors: string[] = [];

  for (const u of uris) {
    try {
      const st = await vscode.workspace.fs.stat(u);
      if (st.type & vscode.FileType.Directory) {
        continue;
      }
      if (!ignoreSize && st.size > cfg.maxBytesPerFile) {
        skipped.push({ path: u.fsPath, reason: `size>${cfg.maxBytesPerFile}` });
        continue;
      }

      let text = await fs.readFile(u.fsPath, "utf8");
      text = text.replace(/\r\n/g, "\n");
      if (cfg.normalizeTabsToSpaces) {
        text = text.replace(/\t/g, "  ");
      }

      const lang = languageFromExt(path.extname(u.fsPath).toLowerCase());
      if (cfg.stripMode !== "none") {
        text = stripComments(
          text,
          lang,
          cfg.stripMode,
          cfg.stripDocstringsInPython
        );
      }
      if (cfg.maskSecrets) {
        text = maskSecretsFn(text);
      }
      text = text.replace(/[ \t]+$/gm, "");

      const lines = text.split("\n").length;
      const bytes = Buffer.byteLength(text, "utf8");
      let rel = path.relative(rootFs, u.fsPath).replaceAll("\\", "/");
      if (!rel) {
        rel = path.basename(u.fsPath);
      }
      const hash = sha256Hex(text);

      metas.push({ rel, lang, lines, bytes, hash });
      blocks.push(
        `=== FILE: ${rel} | LINES:${lines} BYTES:${bytes} | LANG:${
          lang ?? "plain"
        } | HASH:sha256:${hash} ===
\`\`\`${lang ?? ""}
${text}
\`\`\`
=== END FILE ===

`
      );
    } catch (e: any) {
      errors.push(`${u.fsPath}: ${e?.message ?? e}`);
    }
  }

  if (!blocks.length) {
    vscode.window.showWarningMessage("No usable files in selection.");
    if (opts?.showSkipReport && skipped.length) {
      console.log(
        "CopyPasta skipped:\n" +
          skipped.map((s) => `- ${s.path} (${s.reason})`).join("\n")
      );
    }
    return;
  }

  const tree = cfg.includeTree ? await buildTree(rootUri) : null;
  const ctx = await buildContextHeader(rootUri, metas, tree, goal, {
    stripMode: cfg.stripMode,
    maskSecrets: cfg.maskSecrets,
  });
  const parts = chunkBundles(ctx, blocks, cfg.tokenBudget);

  if (parts.length === 1) {
    await vscode.env.clipboard.writeText(parts[0]);
  } else {
    const pick = await vscode.window.showQuickPick(
      [
        { label: `Copy All (${parts.length} parts)`, detail: "Recommended" },
        ...parts.map((_, i) => ({
          label: `Copy PART ${i + 1}/${parts.length}`,
          detail: `~${estimateTokens(parts[i])} tokens`,
        })),
      ],
      { title: "CopyPasta – Parts (selection)" }
    );
    if (!pick) {
      return;
    }
    if (pick.label.startsWith("Copy All")) {
      await vscode.env.clipboard.writeText(
        parts
          .map(
            (p, i) =>
              p +
              (i < parts.length - 1 ? "\n=== CONTINUE IN NEXT PART ===\n" : "")
          )
          .join("\n")
      );
    } else {
      const idx = parseInt(pick.label.split(" ")[2]) - 1;
      await vscode.env.clipboard.writeText(parts[idx]);
    }
  }

  if (opts?.showSkipReport && skipped.length) {
    vscode.window.showInformationMessage(
      `Skipped ${skipped.length} large file(s). See Output log.`
    );
    console.log(
      "CopyPasta skipped:\n" +
        skipped.map((s) => `- ${s.path} (${s.reason})`).join("\n")
    );
  }
  if (errors.length) {
    vscode.window.showWarningMessage(
      `Some selected files failed: ${errors.length}. See Output Log.`
    );
    console.log("CopyPasta errors:\n" + errors.join("\n"));
  }
}
