import * as vscode from "vscode";
import { buildTree } from "@core/fsTree";
import {
  buildGitignoreTree,
  GitIgnoreMap,
  ignores,
  makeGlobExcluder,
} from "@core/gitignore";
import { getConfig } from "@core/config";
import path from "path";

export async function copyTree() {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    vscode.window.showErrorMessage("Open a folder or workspace first.");
    return;
  }

  const cfg = getConfig();

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

  let gi: GitIgnoreMap | null = null;
  if (cfg.useGitignore) {
    try {
      gi = await buildGitignoreTree(rootUri.fsPath);
    } catch {
      gi = null;
    }
  }

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

  await vscode.env.clipboard.writeText("```text\n" + tree + "\n```");
  vscode.window.showInformationMessage("Tree copied.");
}
