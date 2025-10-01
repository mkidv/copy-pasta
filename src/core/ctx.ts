import * as vscode from "vscode";

let extCtx: vscode.ExtensionContext | null = null;

export function setExtensionContext(ctx: vscode.ExtensionContext) {
  extCtx = ctx;
}

export function getExtensionContext(): vscode.ExtensionContext {
  if (!extCtx) {
    throw new Error("CopyPasta: ExtensionContext not set.");
  }
  return extCtx;
}
