import * as vscode from "vscode";
import type { StripMode } from "../core/strip";

export interface PastaConfig {
  defaultGlob: string;
  exclude: string[];
  maxBytesPerFile: number;
  stripMode: StripMode;
  compactBlankLines: boolean;
  maskSecrets: boolean;
  tokenBudget: number;
  includeTree: boolean;
  normalizeTabsToSpaces: boolean;
  splitOversizedFiles: boolean;
  oversizedChunkLines: number;
  stripDocstringsInPython: boolean;
  folderCopyMode: "all" | "respectExcludes";
  maxDepthExplorer: number;
  detectBinary: boolean;
  useGitignore: boolean;
}

export function getConfig(): PastaConfig {
  const cfg = vscode.workspace.getConfiguration("sauceCode");
  const get = <T>(k: string, d: T): T => cfg.get<T>(k) ?? d;
  return {
    defaultGlob: get(
      "defaultGlob",
      "**/*.{dart,ts,tsx,js,jsx,rs,py,go,java,kt,c,cc,cpp,h,hpp,cs,swift,sh,yml,yaml,toml,md,sql,json}"
    ),
    exclude: get("exclude", []),
    maxBytesPerFile: get("maxBytesPerFile", 2_000_000),
    stripMode: get<StripMode>("stripMode", "safe"),
    compactBlankLines: get("compactBlankLines", true),
    maskSecrets: get("maskSecrets", true),
    tokenBudget: get("tokenBudget", 12000),
    includeTree: get("includeTree", true),
    normalizeTabsToSpaces: get("normalizeTabsToSpaces", false),
    splitOversizedFiles: get("splitOversizedFiles", true),
    oversizedChunkLines: get("oversizedChunkLines", 400),
    stripDocstringsInPython: get("stripDocstringsInPython", true),
    folderCopyMode: get("folderCopyMode", "all"),
    maxDepthExplorer: get("maxDepthExplorer", 1024),
    detectBinary: get("detectBinary", true),
    useGitignore: get("useGitignore", true),
  };
}
