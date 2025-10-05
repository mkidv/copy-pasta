import * as path from "path";
import * as vscode from "vscode";
import ignore, { type Ignore } from "ignore";

export type GitIgnoreMap = Map<string, Ignore>;

async function readUtf8IfExists(uri: vscode.Uri): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

export async function buildGitignoreTree(
  rootFs: string
): Promise<GitIgnoreMap> {
  const map: GitIgnoreMap = new Map();

  async function build(dir: string) {
    const ig = ignore(); // règles LOCALES
    const gi = await readUtf8IfExists(
      vscode.Uri.file(path.join(dir, ".gitignore"))
    );
    if (gi) {
      ig.add(gi);
    }
    map.set(dir, ig);

    try {
      const entries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.file(dir)
      );
      await Promise.all(
        entries
          .filter(
            ([name, type]) =>
              type === vscode.FileType.Directory && name !== ".git"
          )
          .map(([name]) => build(path.join(dir, name)))
      );
    } catch {
      /* noop */
    }
  }

  await build(rootFs);
  return map;
}
export function ignores(
  map: GitIgnoreMap,
  _rootFs: string,
  absPath: string
): boolean {
  let dir = path.dirname(absPath);
  let last = "";
  while (dir !== last) {
    const ig = map.get(dir);
    if (ig) {
      const rel = path.relative(dir, absPath).replaceAll("\\", "/");
      if (ig.ignores(rel)) {
        return true;
      }
    }
    last = dir;
    dir = path.dirname(dir);
  }
  return false;
}

// Compile VS Code-style exclude globs into a predicate usable by buildTree
export function makeGlobExcluder(rootFs: string, patterns: string[]) {
  const ig = ignore();
  ig.add(patterns);
  return (absPath: string) => {
    const rel = path.relative(rootFs, absPath).replaceAll("\\", "/");
    return ig.ignores(rel) || ig.ignores(rel + (rel.endsWith("/") ? "" : "/"));
  };
}
