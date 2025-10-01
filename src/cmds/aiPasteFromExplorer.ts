import * as vscode from "vscode";
import { getConfig } from "@core/config";
import { expandDirAllFiles, isDir } from "@core/fsTree";
import { aiPasteWithFixedUris } from "./withFixed";

export async function aiPasteFromExplorer(uri: vscode.Uri, all?: vscode.Uri[]) {
  const targets = (all && all.length ? all : [uri]).filter(Boolean);
  if (!targets.length) {
    vscode.window.showWarningMessage("Nothing selected.");
    return;
  }

  const cfg = getConfig();
  const allDirs = await Promise.all(targets.map(isDir)).then((xs) =>
    xs.every(Boolean)
  );

  const include: vscode.Uri[] = [];

  if (allDirs) {
    if (cfg.folderCopyMode === "all") {
      for (const d of targets) {
        const tmp: string[] = [];
        await expandDirAllFiles(d.fsPath, cfg.maxDepthExplorer, tmp);
        tmp.forEach((p) => include.push(vscode.Uri.file(p)));
      }
      await aiPasteWithFixedUris(include, {
        ignoreSizeLimit: true,
        showSkipReport: true,
      });
      return;
    } else {
      for (const d of targets) {
        const rp = new vscode.RelativePattern(d, cfg.defaultGlob);
        const ex = cfg.exclude.length
          ? new vscode.RelativePattern(d, `{${cfg.exclude.join(",")}}`)
          : undefined;
        const found = await vscode.workspace.findFiles(rp, ex as any, 500_000);
        include.push(...found);
      }
      await aiPasteWithFixedUris(include, {
        ignoreSizeLimit: false,
        showSkipReport: true,
      });
      return;
    }
  }

  // Mixte (fichiers / dossiers) → on prend tel quel
  include.push(...targets);
  await aiPasteWithFixedUris(include, {
    ignoreSizeLimit: false,
    showSkipReport: true,
  });
}
