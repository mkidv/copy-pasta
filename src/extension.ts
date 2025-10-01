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
    vscode.commands.registerCommand("sauceCode.aiPaste", aiPaste),
    vscode.commands.registerCommand("sauceCode.copyTree", copyTree),
    vscode.commands.registerCommand(
      "sauceCode.aiPasteFromExplorer",
      (uri: vscode.Uri, all?: vscode.Uri[]) => aiPasteFromExplorer(uri, all)
    ),
    vscode.commands.registerCommand(
      "sauceCode.copyTreeFromExplorer",
      (uri: vscode.Uri, all?: vscode.Uri[]) => copyTreeFromExplorer(uri, all)
    ),
    vscode.commands.registerCommand("sauceCode.copyLast", copyLast),
    vscode.commands.registerCommand("sauceCode.copyNextPart", copyNextPart),
    vscode.commands.registerCommand("sauceCode.showHistory", showHistory),
  );
}

export function deactivate() {}
