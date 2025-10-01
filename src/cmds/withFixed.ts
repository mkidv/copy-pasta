import * as vscode from "vscode";
import * as path from "path";
import { getConfig } from "@core/config";
import { buildTree } from "@core/fsTree";
import { FileMeta, buildBundle } from "@core/bundle";
import {
  estimateTokens,
  sha256Hex,
  commonRootDir,
  ensureDirPath,
} from "@core/utils";
import { pushHistory, setSession } from "@core/history";
import { logBlock, toastWithLog } from "@core/log";
import { processUris } from "@core/processor";

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

  let metas: FileMeta[] = [];
  let blocks: string[] = [];
  let skipped: { path: string; reason: string }[] = [];
  let errors: string[] = [];

  const out = await processUris({
    uris,
    cfg,
    rootFs,
    ignoreSizeLimit: !!ignoreSize,
  });
  metas = out.metas;
  blocks = out.blocks;
  skipped = out.skipped;
  errors = out.errors;

  if (!blocks.length) {
    vscode.window.showWarningMessage("No usable files in selection.");
    if (opts?.showSkipReport && skipped.length) {
      console.log(
        "SauceCode skipped:\n" +
          skipped.map((s) => `- ${s.path} (${s.reason})`).join("\n")
      );
    }
    return;
  }

  const tree = cfg.includeTree ? await buildTree(rootUri) : null;
  const parts = await buildBundle({
    root: rootUri,
    metas,
    tree,
    goal,
    rules: { stripMode: cfg.stripMode, maskSecrets: cfg.maskSecrets },
    blocks,
    tokenBudget: cfg.tokenBudget,
    compact: cfg.compactBlankLines,
    keepCRLF: false, // on reste en \n comme dans le pipeline
  });

  const projectName = path.basename(rootUri.fsPath);
  const tokensApprox = parts.map((p) => estimateTokens(p));
  const id = sha256Hex(parts.join("\n"));
  await pushHistory({
    id,
    createdAt: Date.now(),
    project: projectName,
    goal,
    files: metas.length,
    bytes: metas.reduce((a, m) => a + m.bytes, 0),
    partsCount: parts.length,
    tokensApprox,
    parts,
  });

  if (parts.length === 1) {
    await vscode.env.clipboard.writeText(parts[0]);
    vscode.window.showInformationMessage(
      `SauceCode – selection copied (1 part, ${metas.length} files).`
    );
    await setSession(null);
  } else {
    const pick = await vscode.window.showQuickPick(
      [
        { label: `Copy All (${parts.length} parts)`, detail: "Recommended" },
        ...parts.map((_, i) => ({
          label: `Copy PART ${i + 1}/${parts.length}`,
          detail: `~${estimateTokens(parts[i])} tokens`,
        })),
      ],
      { title: "SauceCode – Parts (selection)" }
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
      vscode.window.showInformationMessage(
        `SauceCode – selection copied (${parts.length} parts).`
      );
      await setSession(null);
    } else {
      const idx = parseInt(pick.label.split(" ")[2]) - 1;
      await vscode.env.clipboard.writeText(parts[idx]);
      vscode.window
        .showInformationMessage(
          `SauceCode – PART ${idx + 1}/${parts.length} copied.`,
          "Copy Next Part"
        )
        .then(async (a) => {
          if (a === "Copy Next Part") {
            await vscode.commands.executeCommand("SauceCode.copyNextPart");
          }
        });
      await setSession({ id, index: idx + 1 });
    }
  }

  if (opts?.showSkipReport && skipped.length) {
    logBlock(
      "withFixed – skipped (oversized or filtered)",
      skipped.map((s) => `- ${s.path} (${s.reason})`)
    );
    await toastWithLog(`Skipped ${skipped.length} file(s).`);
  }
  
  if (errors.length) {
    logBlock("withFixed – errors", errors);
    await toastWithLog(`Some selected files failed: ${errors.length}.`);
  }
}
