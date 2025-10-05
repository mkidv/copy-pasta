import * as vscode from "vscode";
import * as path from "path";
import { getConfig } from "@core/config";
import { buildTree } from "@core/fsTree";
import { FileMeta, buildBundle } from "@core/bundle";
import { estimateTokens, sha256Hex } from "@core/utils";
import { logBlock, logInfo, toastWithLog } from "@core/log";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { pushHistory, setSession } from "@core/history";
import { processUris } from "@core/processor";
import {
  buildGitignoreTree,
  GitIgnoreMap,
  ignores,
  makeGlobExcluder,
} from "@core/gitignore";

const exec = promisify(execCb);

export async function aiPaste() {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    vscode.window.showErrorMessage("Open a folder or workspace first.");
    return;
  }

  const cfg = getConfig();

  // Pick root
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Workspace root", root: ws.uri },
      { label: "Pick a folder…", root: undefined as any },
    ],
    { title: "Select workspace root" }
  );
  const rootUri =
    choice?.root ??
    (
      await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Use this folder",
      })
    )?.[0];
  if (!rootUri) {
    return;
  }

  // Goal + glob
  const goal =
    (await vscode.window.showInputBox({
      title: "Small goal (1-2 lines)",
      value: "Review & refactor.",
    })) || "";
  const glob =
    (await vscode.window.showInputBox({
      title: "File glob to include",
      value: cfg.defaultGlob,
    })) || cfg.defaultGlob;

  // Collect files
  const include = new vscode.RelativePattern(rootUri, glob);
  const exclude = cfg.exclude.length
    ? new vscode.RelativePattern(rootUri, `{${cfg.exclude.join(",")}}`)
    : undefined;

  const uris = await vscode.workspace.findFiles(
    include,
    exclude as any,
    100000
  );
  if (!uris.length) {
    vscode.window.showWarningMessage("No file found.");
    return;
  }

  let gi: GitIgnoreMap | null = null;
  if (cfg.useGitignore) {
    gi = await buildGitignoreTree(rootUri.fsPath);
  }

  const filtered = !gi
    ? uris
    : uris.filter((u) => !ignores(gi!, rootUri.fsPath, u.fsPath));

  if (!filtered.length) {
    vscode.window.showWarningMessage("All files ignored by .gitignore.");
    return;
  }

  // Prepare bundles
  let metas: FileMeta[] = [];
  let blocks: string[] = [];
  let errors: string[] = [];
  let skipped: { path: string; reason: string }[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "SauceCode: preparing files…",
    },
    async () => {
      const out = await processUris({
        uris: filtered,
        cfg,
        rootFs: rootUri.fsPath,
        ignoreSizeLimit: false,
      });
      metas = out.metas;
      blocks = out.blocks;
      skipped = out.skipped;
      errors = out.errors;
    }
  );

  if (!blocks.length) {
    vscode.window.showWarningMessage("No file usable (all skipped).");
    return;
  }

  // Git (best effort)
  let git = {
    branch: "n/a",
    head: "n/a",
    dirty: "n/a" as "n/a" | "clean" | "dirty",
  };
  try {
    const { stdout: br } = await exec("git rev-parse --abbrev-ref HEAD", {
      cwd: rootUri.fsPath,
    });
    git.branch = br.trim();
    const { stdout: hd } = await exec("git rev-parse --short HEAD", {
      cwd: rootUri.fsPath,
    });
    git.head = hd.trim();
    const { stdout: st } = await exec("git status --porcelain", {
      cwd: rootUri.fsPath,
    });
    git.dirty = st.trim().length ? "dirty" : "clean";
  } catch {}

  const tree = cfg.includeTree
    ? await buildTree(rootUri, 64, (abs) => {
        const byGlobs = cfg.exclude.length
          ? makeGlobExcluder(rootUri.fsPath, cfg.exclude)(abs)
          : false;
        if (byGlobs) {
          return true;
        }
        return cfg.useGitignore && gi
          ? ignores(gi, rootUri.fsPath, abs)
          : false;
      })
    : null;

  const parts = await buildBundle({
    root: rootUri,
    metas,
    tree,
    goal,
    rules: { stripMode: cfg.stripMode, maskSecrets: cfg.maskSecrets },
    gitInfo: git,
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
      `SauceCode (1 part, ${metas.length} files) copied.`
    );
  } else {
    const pick = await vscode.window.showQuickPick(
      [
        { label: `Copy All (${parts.length} parts)`, detail: "Recommended" },
        ...parts.map((_, i) => ({
          label: `Copy PART ${i + 1}/${parts.length}`,
          detail: `~${estimateTokens(parts[i])} tokens`,
        })),
      ],
      { title: "SauceCode – Parts" }
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
        `SauceCode (${parts.length} parts) copied.`
      );
      await setSession(null);
    } else {
      const idx = parseInt(pick.label.split(" ")[2]) - 1;
      await vscode.env.clipboard.writeText(parts[idx]);
      vscode.window
        .showInformationMessage(
          `SauceCode – PART ${idx + 1}/${parts.length} copied.`,
          "Copy Next Part",
          "Open Parts Picker"
        )
        .then(async (action) => {
          if (action === "Copy Next Part") {
            await vscode.commands.executeCommand("sauceCode.copyNextPart");
          } else if (action === "Open Parts Picker") {
            await vscode.commands.executeCommand("sauceCode.showHistory");
          }
        });
      await setSession({ id, index: idx + 1 });
    }
  }

  if (errors.length) {
    logBlock("aiPaste – errors", errors);
    await toastWithLog(`Some files failed: ${errors.length}.`);
  }

  if (skipped.length) {
    logBlock(
      "aiPaste – skipped (oversized or filtered)",
      skipped.map((s) => `- ${s.path} (${s.reason})`)
    );
    logInfo(`Total skipped: ${skipped.length}`);
  }
}
