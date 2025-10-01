import * as vscode from "vscode";
import { aiPaste } from "./cmds/aiPaste";
import { copyTree } from "./cmds/copyTree";
import { aiPasteFromExplorer } from "./cmds/aiPasteFromExplorer";
import { copyTreeFromExplorer } from "./cmds/copyTreeFromExplorer";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    // Palette
    vscode.commands.registerCommand("copyPasta.aiPaste", aiPaste),
    vscode.commands.registerCommand("copyPasta.copyTree", copyTree),

    // Explorer (clic droit)
    vscode.commands.registerCommand(
      "copyPasta.aiPasteFromExplorer",
      (uri: vscode.Uri, all?: vscode.Uri[]) => aiPasteFromExplorer(uri, all)
    ),
    vscode.commands.registerCommand(
      "copyPasta.copyTreeFromExplorer",
      (uri: vscode.Uri, all?: vscode.Uri[]) => copyTreeFromExplorer(uri, all)
    )
  );
}

export function deactivate() {}
