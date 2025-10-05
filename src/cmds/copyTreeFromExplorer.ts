import * as vscode from "vscode";
import { buildTree, isDir } from "@core/fsTree";
import { buildGitignoreTree, GitIgnoreMap, ignores, makeGlobExcluder } from "@core/gitignore";
import { getConfig } from "@core/config";

export async function copyTreeFromExplorer(
  uri: vscode.Uri,
  all?: vscode.Uri[]
) {
  const cfg = getConfig();

  const targets = (all && all.length ? all : [uri]).filter(Boolean);
  if (!targets.length) {
    vscode.window.showWarningMessage("Nothing selected.");
    return;
  }

  const dirs: vscode.Uri[] = [];
  for (const t of targets) {
    if (await isDir(t)) {
      dirs.push(t);
    }
  }

  if (!dirs.length) {
    vscode.window.showWarningMessage("Select at least one folder.");
    return;
  }

  let out = "";
  for (const d of dirs) {
    let gi: GitIgnoreMap | null = null;
    if (cfg.useGitignore) {
      try {
        gi = await buildGitignoreTree(d.fsPath);
      } catch {
        gi = null;
      }
    }

    const tree = cfg.includeTree
      ? await buildTree(d, 64, (abs) => {
          const byGlobs = cfg.exclude.length
            ? makeGlobExcluder(d.fsPath, cfg.exclude)(abs)
            : false;
          if (byGlobs) {
            return true;
          }
          return cfg.useGitignore && gi ? ignores(gi, d.fsPath, abs) : false;
        })
      : null;
    out += "```text\n" + tree + "\n```\n\n";
  }

  await vscode.env.clipboard.writeText(out.trimEnd());
  vscode.window.showInformationMessage(
    `Tree copied for ${dirs.length} folder(s).`
  );
}
