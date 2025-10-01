import * as vscode from "vscode";
import { aiPaste } from "./cmds/aiPaste";
import { copyTree } from "./cmds/copyTree";
import { aiPasteFromExplorer } from "./cmds/aiPasteFromExplorer";
import { copyTreeFromExplorer } from "./cmds/copyTreeFromExplorer";
import { setExtensionContext } from "./core/ctx";
import { copyLast, copyNextPart, showHistory } from "./cmds/history";

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("copyPasta.aiPaste", aiPaste),
    vscode.commands.registerCommand("copyPasta.copyTree", copyTree),
    vscode.commands.registerCommand(
      "copyPasta.aiPasteFromExplorer",
      (uri: vscode.Uri, all?: vscode.Uri[]) => aiPasteFromExplorer(uri, all)
    ),
    vscode.commands.registerCommand(
      "copyPasta.copyTreeFromExplorer",
      (uri: vscode.Uri, all?: vscode.Uri[]) => copyTreeFromExplorer(uri, all)
    ),
    vscode.commands.registerCommand("copyPasta.copyLast", copyLast),
    vscode.commands.registerCommand("copyPasta.copyNextPart", copyNextPart),
    vscode.commands.registerCommand("copyPasta.showHistory", showHistory),
  );
}

export function deactivate() {}
