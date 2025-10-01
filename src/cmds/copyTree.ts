import * as vscode from "vscode";
import { buildTree } from "@core/fsTree";

export async function copyTree() {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    vscode.window.showErrorMessage("Open a folder or workspace first.");
    return;
  }

  const choice = await vscode.window.showQuickPick(
    [
      { label: "Workspace root", root: ws.uri },
      { label: "Pick a folder…", root: undefined as any },
    ],
    { title: "Select workspace root" }
  );
  const root =
    choice?.root ??
    (
      await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Use this folder",
      })
    )?.[0];

  if (!root) {
    return;
  }

  const tree = await buildTree(root);
  await vscode.env.clipboard.writeText("```text\n" + tree + "\n```");
  vscode.window.showInformationMessage("Tree copied.");
}
