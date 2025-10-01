import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as vscode from "vscode";

export async function isDir(uri: vscode.Uri): Promise<boolean> {
  try { const s = await vscode.workspace.fs.stat(uri); return !!(s.type & vscode.FileType.Directory); }
  catch { return false; }
}

export async function expandDirAllFiles(dirFs: string, maxDepth: number, out: string[], depth = 0): Promise<void> {
  if (depth > maxDepth) {return;}
  let entries: string[] = [];
  try { entries = await fs.readdir(dirFs); } catch { return; }
  entries.sort((a,b)=>a.localeCompare(b));
  for (const name of entries) {
    if (name === "." || name === "..") {continue;}
    const full = path.join(dirFs, name);
    let st: fsSync.Stats | null = null;
    try { st = fsSync.statSync(full); } catch { /* skip */ }
    if (!st) {continue;}
    if (st.isDirectory()) {await expandDirAllFiles(full, maxDepth, out, depth+1);}
    else if (st.isFile()) {out.push(full);}
  }
}

export async function buildTree(root: vscode.Uri, maxDepth = 64): Promise<string> {
  const rootFs = root.fsPath;
  const lines: string[] = [path.basename(rootFs)];
  function walk(rel: string, prefix: string, depth: number) {
    if (depth > maxDepth) {return;}
    const abs = rel ? path.join(rootFs, rel) : rootFs;
    let dirents: fsSync.Dirent[] = [];
    try { dirents = fsSync.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    dirents = dirents
      .filter(d => ![".git","node_modules",".dart_tool","build"].includes(d.name))
      .sort((a,b)=>a.name.localeCompare(b.name));
    dirents.forEach((d,i)=>{
      const last = i === dirents.length - 1;
      const mark = last ? "└── " : "├── ";
      lines.push(prefix + mark + d.name);
      if (d.isDirectory()) {
        const nextP = prefix + (last ? "    " : "│   ");
        walk(rel ? path.join(rel, d.name) : d.name, nextP, depth+1);
      }
    });
  }
  walk("", "", 0);
  return lines.join("\n");
}
