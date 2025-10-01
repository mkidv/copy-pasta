import * as vscode from "vscode";

let chan: vscode.OutputChannel | null = null;

export function cpLog(): vscode.OutputChannel {
  if (!chan) {
    chan = vscode.window.createOutputChannel("SauceCode");
  }
  return chan;
}

export function logInfo(msg: string) {
  cpLog().appendLine(msg);
}

export function logBlock(title: string, lines: string[]) {
  const ch = cpLog();
  ch.appendLine(`\n[${title}]`);
  lines.forEach(l => ch.appendLine(l));
}

export async function toastWithLog(message: string) {
  const act = await vscode.window.showInformationMessage(message, "Open Log");
  if (act === "Open Log") {
    cpLog().show(true);
  }
}
