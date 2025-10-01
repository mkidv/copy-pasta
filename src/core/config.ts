import * as vscode from "vscode";
import type { StripMode } from "../core/strip";

export interface PastaConfig {
  defaultGlob: string;
  exclude: string[];
  maxBytesPerFile: number;
  stripMode: StripMode;
  maskSecrets: boolean;
  tokenBudget: number;
  includeTree: boolean;
  normalizeTabsToSpaces: boolean;
  splitOversizedFiles: boolean;
  oversizedChunkLines: number;
  stripDocstringsInPython: boolean;
  folderCopyMode: "all" | "respectExcludes";
  maxDepthExplorer: number;
}

export function getConfig(): PastaConfig {
  const cfg = vscode.workspace.getConfiguration("copyPasta");
  const get = <T>(k: string, d: T): T => cfg.get<T>(k) ?? d;
  return {
    defaultGlob: get("defaultGlob", "**/*"),
    exclude: get("exclude", []),
    maxBytesPerFile: get("maxBytesPerFile", 1024*1024),
    stripMode: get<StripMode>("stripMode", "none"),
    maskSecrets: get("maskSecrets", true),
    tokenBudget: get("tokenBudget", 12000),
    includeTree: get("includeTree", true),
    normalizeTabsToSpaces: get("normalizeTabsToSpaces", false),
    splitOversizedFiles: get("splitOversizedFiles", true),
    oversizedChunkLines: get("oversizedChunkLines", 300),
    stripDocstringsInPython: get("stripDocstringsInPython", false),
    folderCopyMode: get("folderCopyMode", "all"),
    maxDepthExplorer: get("maxDepthExplorer", 1024),
  };
}
