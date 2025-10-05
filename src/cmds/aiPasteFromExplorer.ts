import * as vscode from "vscode";
import { getConfig } from "@core/config";
import { expandDirAllFiles, isDir } from "@core/fsTree";
import { aiPasteWithFixedUris } from "./withFixed";
import {
  buildGitignoreTree,
  ignores,
  type GitIgnoreMap,
} from "@core/gitignore";
import { commonRootDir, ensureDirPath } from "@core/utils";

export async function aiPasteFromExplorer(uri: vscode.Uri, all?: vscode.Uri[]) {
  const targets = (all && all.length ? all : [uri]).filter(Boolean);
  if (!targets.length) {
    vscode.window.showWarningMessage("Nothing selected.");
    return;
  }

  const cfg = getConfig();

  // Split selection
  const dirs: vscode.Uri[] = [];
  const files: vscode.Uri[] = [];
  for (const t of targets) {
    (await isDir(t)) ? dirs.push(t) : files.push(t);
  }

  // Expand folders -> files[]
  const expanded: vscode.Uri[] = [];
  if (dirs.length) {
    if (cfg.folderCopyMode === "all") {
      for (const d of dirs) {
        const tmp: string[] = [];
        await expandDirAllFiles(d.fsPath, cfg.maxDepthExplorer, tmp);
        for (const p of tmp) {
          expanded.push(vscode.Uri.file(p));
        }
      }
    } else {
      // respectExcludes: use defaultGlob + excludes
      for (const d of dirs) {
        const rp = new vscode.RelativePattern(d, cfg.defaultGlob);
        const ex = cfg.exclude.length
          ? new vscode.RelativePattern(d, `{${cfg.exclude.join(",")}}`)
          : undefined;
        const found = await vscode.workspace.findFiles(rp, ex as any, 500_000);
        expanded.push(...found);
      }
    }
  }

  // Merge: (expanded from dirs) + (explicit files)
  const include: vscode.Uri[] = [];
  const seen = new Set<string>();
  const add = (u: vscode.Uri) => {
    // only keep files; directories are useless downstream
    if (seen.has(u.fsPath)) {
      return;
    }
    seen.add(u.fsPath);
    include.push(u);
  };
  expanded.forEach(add);
  files.forEach(add);

  if (!include.length) {
    vscode.window.showWarningMessage("No usable files in selection.");
    return;
  }

  // Optional .gitignore filtering (use common root)
  let final = include;
  if (cfg.useGitignore) {
    const roots = targets.map((t) => ensureDirPath(t.fsPath));
    const base = commonRootDir(roots);
    let gi: GitIgnoreMap | null = null;
    try {
      gi = await buildGitignoreTree(base);
    } catch {
      gi = null;
    }
    if (gi) {
      final = final.filter((u) => !ignores(gi!, base, u.fsPath));
      if (!final.length) {
        vscode.window.showWarningMessage("All files ignored by .gitignore.");
        return;
      }
    }
  }

  // If user chose "all", we ignore size limit (consistency with folder-only case)
  await aiPasteWithFixedUris(final, {
    ignoreSizeLimit: cfg.folderCopyMode === "all",
    showSkipReport: true,
  });
}
