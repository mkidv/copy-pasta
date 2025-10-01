import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { getConfig } from "../core/config";
import { buildTree } from "../core/fsTree";
import { stripComments } from "../core/strip";
import { maskSecretsFn } from "../core/secrets";
import { languageFromExt } from "../core/lang";
import { chunkBundles, buildContextHeader, FileMeta } from "../core/bundle";
import { limit, estimateTokens, sha256Hex } from "../core/utils";
import { exec as execCb } from "child_process";
import { promisify } from "util";
const exec = promisify(execCb);

function mergeExcludes(ex: string[]): string {
  if (!ex.length) {return "";}
  if (ex.length === 1) {return ex[0];}
  return `{${ex.join(",")}}`;
}

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
    (await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Use this folder",
    }))?.[0];
  if (!rootUri) {return;}

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
    ? new vscode.RelativePattern(rootUri, mergeExcludes(cfg.exclude))
    : undefined;

  const uris = await vscode.workspace.findFiles(include, exclude as any, 100000);
  if (!uris.length) {
    vscode.window.showWarningMessage("No file found.");
    return;
  }

  // Prepare bundles
  const metas: FileMeta[] = [];
  const blocks: string[] = [];
  const errors: string[] = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "CopyPasta: preparing files…",
    },
    async () => {
      await Promise.all(
        uris.map((u) =>
          limit(async () => {
            try {
              const st = await vscode.workspace.fs.stat(u);
              if (st.type & vscode.FileType.Directory) {return;}
              if (st.size > cfg.maxBytesPerFile) {return;}

              let text = await fs.readFile(u.fsPath, "utf8");
              text = text.replace(/\r\n/g, "\n");
              if (cfg.normalizeTabsToSpaces) {text = text.replace(/\t/g, "  ");}

              const lang = languageFromExt(path.extname(u.fsPath).toLowerCase());
              if (cfg.stripMode !== "none") {
                text = stripComments(
                  text,
                  lang,
                  cfg.stripMode,
                  cfg.stripDocstringsInPython
                );
              }
              if (cfg.maskSecrets) {text = maskSecretsFn(text);}
              text = text.replace(/[ \t]+$/gm, "");

              const lines = text.split("\n").length;
              const bytes = Buffer.byteLength(text, "utf8");
              const rel =
                path
                  .relative(rootUri.fsPath, u.fsPath)
                  .replaceAll("\\", "/") || path.basename(u.fsPath);
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
          })
        )
      );
    }
  );

  if (!blocks.length) {
    vscode.window.showWarningMessage("No file usable (all skipped).");
    return;
  }

  // Git (best effort)
  let git = { branch: "n/a", head: "n/a", dirty: "n/a" as "n/a" | "clean" | "dirty" };
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

  const tree = cfg.includeTree ? await buildTree(rootUri) : null;
  const ctx = await buildContextHeader(
    rootUri,
    metas,
    tree,
    goal,
    { stripMode: cfg.stripMode, maskSecrets: cfg.maskSecrets },
    git
  );

  const parts = chunkBundles(ctx, blocks, cfg.tokenBudget);

  if (parts.length === 1) {
    await vscode.env.clipboard.writeText(parts[0]);
    vscode.window.showInformationMessage(
      `CopyPasta (1 part, ${metas.length} files) copied.`
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
      { title: "CopyPasta – Parts" }
    );
    if (!pick) {return;}
    if (pick.label.startsWith("Copy All")) {
      await vscode.env.clipboard.writeText(
        parts
          .map(
            (p, i) =>
              p + (i < parts.length - 1 ? "\n=== CONTINUE IN NEXT PART ===\n" : "")
          )
          .join("\n")
      );
      vscode.window.showInformationMessage(
        `CopyPasta (${parts.length} parts) copied.`
      );
    } else {
      const idx = parseInt(pick.label.split(" ")[2]) - 1;
      await vscode.env.clipboard.writeText(parts[idx]);
      vscode.window.showInformationMessage(
        `CopyPasta – PART ${idx + 1}/${parts.length} copied.`
      );
    }
  }

  if (errors.length) {
    vscode.window.showWarningMessage(
      `Some files failed: ${errors.length}. See Output Log.`
    );
    console.log("copyPasta.aiPaste errors:\n" + errors.join("\n"));
  }
}
