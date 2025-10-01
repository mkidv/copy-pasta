import * as vscode from "vscode";
import { buildTree, isDir } from "../core/fsTree";

export async function copyTreeFromExplorer(
  uri: vscode.Uri,
  all?: vscode.Uri[]
) {
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
    const tree = await buildTree(d);
    out += "```text\n" + tree + "\n```\n\n";
  }

  await vscode.env.clipboard.writeText(out.trimEnd());
  vscode.window.showInformationMessage(
    `Tree copied for ${dirs.length} folder(s).`
  );
}
