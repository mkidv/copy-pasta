import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as crypto from "crypto";
import { exec as execCb } from "child_process";
import { promisify } from "util";
const exec = promisify(execCb);

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("copyPasta.aiPaste", aiPaste),
    vscode.commands.registerCommand("copyPasta.copyTree", copyTree),
    vscode.commands.registerCommand(
      "copyPasta.aiPasteFromExplorer",
      async (uri: vscode.Uri, all: vscode.Uri[] | undefined) => {
        const targets = (all && all.length ? all : [uri]).filter(Boolean);
        await aiPasteFromUris(targets);
      }
    ),
    vscode.commands.registerCommand(
      "copyPasta.copyTreeFromExplorer",
      async (uri: vscode.Uri, all: vscode.Uri[] | undefined) => {
        const targets = (all && all.length ? all : [uri]).filter(Boolean);
        await copyTreeFromUris(targets);
      }
    )
  );
}
export function deactivate() {}

type Lang = string | null;
type StripMode = "none" | "safe" | "keep-doc";

interface FileMeta {
  rel: string;
  lang: Lang;
  lines: number;
  bytes: number;
  hash: string; // sha256 hex
}

async function aiPaste() {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    vscode.window.showErrorMessage("Open a folder or workspace first.");
    return;
  }

  // 1) Collect config
  const cfg = vscode.workspace.getConfiguration("copyPasta");
  const defaultGlob = cfg.get<string>("defaultGlob")!;
  const excludeGlobs = cfg.get<string[]>("exclude")!;
  const maxBytesPerFile = cfg.get<number>("maxBytesPerFile")!;
  const stripMode = cfg.get<string>("stripMode") as StripMode;
  const maskSecrets = cfg.get<boolean>("maskSecrets")!;
  const tokenBudget = cfg.get<number>("tokenBudget")!;
  const includeTree = cfg.get<boolean>("includeTree")!;
  const normalizeTabsToSpaces = cfg.get<boolean>("normalizeTabsToSpaces")!;
  const splitOversizedFiles = cfg.get<boolean>("splitOversizedFiles")!;
  const oversizedChunkLines = cfg.get<number>("oversizedChunkLines")!;
  const stripDocPy = cfg.get<boolean>("stripDocstringsInPython")!;

  // 2) Prompt minimal
  const rootUri = await pickRoot(ws);
  if (!rootUri) {
    return;
  }
  const goal =
    (await vscode.window.showInputBox({
      title: "Small goal (1-2 lines)",
      value: "Check code dans optimize.",
    })) || "";
  const glob =
    (await vscode.window.showInputBox({
      title: "File glob to include",
      value: defaultGlob,
    })) || defaultGlob;

  // 3) Find files
  const includePattern = new vscode.RelativePattern(rootUri, glob);
  const excludePattern = new vscode.RelativePattern(
    rootUri,
    mergeExcludes(excludeGlobs)
  );
  const uris = await vscode.workspace.findFiles(
    includePattern,
    excludePattern,
    100_000
  );

  if (!uris.length) {
    vscode.window.showWarningMessage("No file found.");
    return;
  }

  // 4) Prepare meta, build contents
  const metas: FileMeta[] = [];
  const fileBundles: {
    header: string;
    fenceOpen: string;
    body: string;
    fenceClose: string;
    end: string;
    meta: FileMeta;
  }[] = [];
  const errors: string[] = [];
  let totalBytes = 0;
  let totalLines = 0;

  for (const uri of uris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > maxBytesPerFile) {
        continue;
      }
      let text = await fs.readFile(uri.fsPath, "utf8");

      // Normalize \r\n -> \n
      text = text.replace(/\r\n/g, "\n");
      if (normalizeTabsToSpaces) {
        text = text.replace(/\t/g, "  ");
      }
      if (stripMode !== "none") {
        text = stripComments(
          text,
          languageFromExt(path.extname(uri.fsPath).toLowerCase()),
          stripMode,
          stripDocPy
        );
      }
      if (maskSecrets) {
        text = maskSecretsFn(text);
      }

      // Trim trailing spaces
      text = text.replace(/[ \t]+$/gm, "");
      const lines = text.split("\n").length;
      const bytes = Buffer.byteLength(text, "utf8");
      totalBytes += bytes;
      totalLines += lines;

      const rel = path
        .relative(rootUri.fsPath, uri.fsPath)
        .replaceAll("\\", "/");
      const lang = languageFromExt(path.extname(rel).toLowerCase());
      const hash = sha256Hex(text);
      const meta: FileMeta = { rel, lang, lines, bytes, hash };
      metas.push(meta);

      const header = `=== FILE: ${rel} | LINES:${lines} BYTES:${bytes} | LANG:${
        lang ?? "plain"
      } | HASH:sha256:${hash} ===`;
      const fenceOpen = "```" + (lang ?? "");
      const fenceClose = "```";
      const end = "=== END FILE ===";
      fileBundles.push({
        header,
        fenceOpen,
        body: text,
        fenceClose,
        end,
        meta,
      });
    } catch (e: any) {
      errors.push(`${uri.fsPath}: ${e?.message ?? e}`);
    }
  }

  if (!fileBundles.length) {
    vscode.window.showWarningMessage("No file usable (all skipped).");
    return;
  }

  // 5) Context header + tree + TOC
  const ctx = await buildContextHeader(
    rootUri,
    metas,
    includeTree ? await buildTree(rootUri, { maxEntries: 50_000 }) : null,
    goal
  );

  // 6) Token-aware chunking
  const parts = chunkBundles(
    ctx,
    fileBundles,
    tokenBudget,
    splitOversizedFiles,
    oversizedChunkLines
  );

  // 7) Clipboard or show QuickPick parts
  if (parts.length === 1) {
    await vscode.env.clipboard.writeText(parts[0]);
    vscode.window.showInformationMessage(
      `CopyPasta (1 part, ${metas.length} files) copied.`
    );
  } else {
    // Propose de copier toutes les parts ou une seule
    const pick = await vscode.window.showQuickPick(
      [
        {
          label: `Copy All ( ${parts.length} parts )`,
          detail: "Recommanded if model accept multiple paste.",
        },
        ...parts.map((_, i) => ({
          label: `Copy PART ${i + 1}/${parts.length}`,
          detail: `~${estimateTokens(parts[i])} tokens`,
        })),
      ],
      { title: "CopyPasta – Parts" }
    );
    if (!pick) {
      return;
    }
    if (pick.label.startsWith("Copier TOUT")) {
      await vscode.env.clipboard.writeText(
        parts
          .map(
            (p, i) =>
              p +
              (i < parts.length - 1 ? "\n=== CONTINUE IN NEXT PART ===\n" : "")
          )
          .join("\n")
      );
      vscode.window.showInformationMessage(
        `CopyPasta (${parts.length} parts) copied.`
      );
    } else {
      const idx = parseInt(pick.label.split(" ")[2].split("/")[0]) - 1;
      await vscode.env.clipboard.writeText(parts[idx]);
      vscode.window.showInformationMessage(
        `CopyPasta – PART ${idx + 1}/${parts.length} copied.`
      );
    }
  }

  if (errors.length) {
    vscode.window.showWarningMessage(
      `Some files failed: ${errors.length}. See Output Log.`
    );
    console.log("copyPasta.aiPaste errors:\n" + errors.join("\n"));
  }
}

async function copyTree() {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) {
    vscode.window.showErrorMessage("Open a folder or workspace first.");
    return;
  }
  const rootUri = await pickRoot(ws);
  if (!rootUri) {
    return;
  }
  const tree = await buildTree(rootUri, { maxEntries: 50_000 });
  await vscode.env.clipboard.writeText(tree);
  vscode.window.showInformationMessage("Tree copied.");
}

async function pickRoot(
  ws: vscode.WorkspaceFolder
): Promise<vscode.Uri | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Workspace root", root: ws.uri },
      { label: "Pick a folder…", root: undefined as any },
    ],
    { title: "Select workspace root" }
  );
  if (!choice) {
    return;
  }
  if (choice.root) {
    return choice.root;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Utiliser ce dossier",
  });
  return picked?.[0];
}

function mergeExcludes(ex: string[]): string {
  // VS Code `findFiles` takes a single exclude pattern if RelativePattern; emulate by union with {a,b,c}
  if (!ex.length) {
    return "";
  }
  if (ex.length === 1) {
    return ex[0];
  }
  return `{${ex.join(",")}}`;
}

function languageFromExt(ext: string): Lang {
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "ts";
    case ".js":
    case ".jsx":
      return "js";
    case ".dart":
      return "dart";
    case ".rs":
      return "rust";
    case ".py":
      return "python";
    case ".go":
      return "go";
    case ".java":
      return "java";
    case ".kt":
      return "kotlin";
    case ".c":
      return "c";
    case ".cc":
    case ".cpp":
    case ".cxx":
      return "cpp";
    case ".h":
    case ".hpp":
      return "cpp";
    case ".cs":
      return "csharp";
    case ".swift":
      return "swift";
    case ".sh":
    case ".bash":
      return "bash";
    case ".yml":
    case ".yaml":
      return "yaml";
    case ".toml":
      return "toml";
    case ".md":
      return "markdown";
    case ".sql":
      return "sql";
    case ".json":
      return "json";
    default:
      return null;
  }
}

function stripComments(
  input: string,
  lang: Lang,
  mode: StripMode,
  stripDocPy: boolean
): string {
  if (mode === "none") {
    return input;
  }
  let text = input;
  // preserve shebang
  let shebang = "";
  if (text.startsWith("#!")) {
    const i = text.indexOf("\n");
    shebang = i >= 0 ? text.slice(0, i + 1) : text + "\n";
    text = i >= 0 ? text.slice(i + 1) : "";
  }
  const cLike = new Set([
    "ts",
    "js",
    "dart",
    "rust",
    "c",
    "cpp",
    "csharp",
    "java",
    "kotlin",
    "go",
    "swift",
    null,
  ]);
  const hashLike = new Set(["python", "bash", "yaml", "toml", null]);
  const sqlLike = new Set(["sql", null]);

  if (cLike.has(lang)) {
    // block /* ... */
    text = text.replace(/\/\*[\s\S]*?\*\//g, "");
    // line //
    text = text.replace(/(^|[ \t])\/\/.*$/gm, "$1");
  }
  if (hashLike.has(lang)) {
    if (mode === "safe") {
      text = text.replace(/(^|\s)#(?!\[).*$/gm, "$1");
    }
    if (mode === "keep-doc") {
      // garder doc-ish (#:) — très heuristique
      text = text.replace(/(^|\s)#(?!:).*$/gm, "$1");
    }
  }
  if (sqlLike.has(lang)) {
    text = text.replace(/\/\*[\s\S]*?\*\//g, "");
    text = text.replace(/--.*$/gm, "");
  }
  if (lang === "python" && stripDocPy && mode !== "keep-doc") {
    text = text.replace(/(^|\n)[ \t]*("""|''')[\s\S]*?\2/g, "$1");
  }
  return shebang + text;
}

function maskSecretsFn(input: string): string {
  let t = input;
  // PEM/PKCS
  t = t.replace(
    /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
    "<SECRET:PEM>"
  );
  // JWT (very rough)
  t = t.replace(
    /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    "<SECRET:JWT>"
  );
  // Firebase API key
  t = t.replace(/\bAIza[0-9A-Za-z\-_]{35}\b/g, "<SECRET:FIREBASE_API_KEY>");
  // Generic API keys (k=v or JSON)
  t = t.replace(
    /\b(API[_-]?KEY|SECRET|TOKEN|ACCESS[_-]?TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{16,})["']?/gi,
    (_m, k) => `<SECRET:${String(k).toUpperCase()}>`
  );
  // Signed URLs tokens
  t = t.replace(
    /([?&](sig|signature|token|X-Amz-Signature))=[A-Za-z0-9%\-_.]+/gi,
    (_m, p) => `${p}=<SECRET:SIGNATURE>`
  );
  return t;
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16); // short for readability
}

function estimateTokens(s: string): number {
  // rough: chars/4
  return Math.ceil(s.length / 4);
}

async function buildContextHeader(
  root: vscode.Uri,
  metas: FileMeta[],
  tree: string | null,
  goal: string
): Promise<string> {
  const project = path.basename(root.fsPath);
  const osStr = `${os.platform()} ${os.arch()}`;
  const vs = vscode.version;
  const langSet = new Set(metas.map((m) => m.lang ?? "plain"));
  const langs = Array.from(langSet).sort().join(",");
  const totalFiles = metas.length;
  const totalLines = metas.reduce((a, m) => a + m.lines, 0);
  const totalBytes = metas.reduce((a, m) => a + m.bytes, 0);
  const merkle = sha256Hex(metas.map((m) => m.hash).join(""));

  let gitBranch = "n/a",
    gitHead = "n/a",
    gitDirty = "n/a";
  try {
    const { stdout: br } = await exec("git rev-parse --abbrev-ref HEAD", {
      cwd: root.fsPath,
    });
    gitBranch = br.trim();
    const { stdout: head } = await exec("git rev-parse --short HEAD", {
      cwd: root.fsPath,
    });
    gitHead = head.trim();
    const { stdout: dirty } = await exec("git status --porcelain", {
      cwd: root.fsPath,
    });
    gitDirty = dirty.trim().length ? "dirty" : "clean";
  } catch {
    /* ignore */
  }

  const toc = metas
    .slice()
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map((m) => `- ${m.rel} (L:${m.lines} B:${m.bytes} H:${m.hash})`)
    .join("\n");

  const parts: string[] = [];
  parts.push("=== AI CONTEXT ===");
  parts.push(`Project: ${project} | OS: ${osStr} | VSCode: ${vs}`);
  parts.push(`Git: branch=${gitBranch} head=${gitHead} ${gitDirty}`);
  parts.push(`Langs: ${langs}`);
  parts.push(`Goal: ${goal || "n/a"}`);
  parts.push(
    `Rules: strip=${vscode.workspace
      .getConfiguration("copyPasta")
      .get("stripMode")} secrets=${vscode.workspace
      .getConfiguration("copyPasta")
      .get("maskSecrets")} eol=\\n`
  );
  parts.push(
    `Files: ${totalFiles} | Lines: ${totalLines} | Bytes: ${totalBytes}`
  );
  parts.push(`BUNDLE-HASH: merkle-sha256:${merkle}`);
  parts.push("=== END AI CONTEXT ===\n");

  if (tree) {
    parts.push("```text\n" + tree + "\n```");
  }

  parts.push("=== TABLE OF CONTENTS ===\n" + toc + "\n=== END TOC ===\n");
  return parts.join("\n");
}

function chunkBundles(
  contextHeader: string,
  bundles: {
    header: string;
    fenceOpen: string;
    body: string;
    fenceClose: string;
    end: string;
    meta: FileMeta;
  }[],
  tokenBudget: number,
  splitOversizedFiles: boolean,
  oversizedChunkLines: number
): string[] {
  const parts: string[] = [];
  let current = "";
  let filesInPart = 0;

  function pushCurrent() {
    if (!current) {
      return;
    }
    const idx = parts.length + 1;
    const header = `=== BUNDLE PART ${idx}/${"N"} | TOKENS≈${estimateTokens(
      current
    )} | FILES:${filesInPart} ===\n`;
    // Inject part header after computing all parts; temporary placeholder for N
    parts.push(header + current);
    current = "";
    filesInPart = 0;
  }

  // first, put context into the first part (or spread if huge)
  let ctx = contextHeader;
  if (estimateTokens(ctx) > tokenBudget) {
    // brutal split context (rare)
    const lines = ctx.split("\n");
    let ctxChunk = "";
    for (const line of lines) {
      if (estimateTokens(ctxChunk + line + "\n") > tokenBudget) {
        parts.push(ctxChunk);
        ctxChunk = "";
      }
      ctxChunk += line + "\n";
    }
    if (ctxChunk) {
      parts.push(ctxChunk);
    }
  } else {
    current += contextHeader + "\n";
  }

  for (const b of bundles) {
    const block = `${b.header}\n${b.fenceOpen}\n${b.body}\n${b.fenceClose}\n${b.end}\n\n`;
    const blockTok = estimateTokens(block);

    if (blockTok > tokenBudget && splitOversizedFiles) {
      // split by lines into chunks
      const lines = b.body.split("\n");
      let idx = 0;
      let part = 1;
      while (idx < lines.length) {
        const slice = lines.slice(idx, idx + oversizedChunkLines).join("\n");
        const subHeader = `${b.header} | PART:${part}`;
        const subBlock = `${subHeader}\n${b.fenceOpen}\n${slice}\n${b.fenceClose}\n${b.end}\n\n`;
        if (estimateTokens(current + subBlock) > tokenBudget && current) {
          pushCurrent();
        }
        current += subBlock;
        filesInPart++;
        idx += oversizedChunkLines;
        part++;
      }
      continue;
    }

    if (estimateTokens(current + block) > tokenBudget && current) {
      pushCurrent();
    }
    current += block;
    filesInPart++;
  }
  if (current) {
    pushCurrent();
  }

  // Fix total count N in headers
  const total = parts.length;
  for (let i = 0; i < total; i++) {
    parts[i] = parts[i].replace(
      /=== BUNDLE PART (\d+)\/N/,
      `=== BUNDLE PART $1/${total}`
    );
    if (i < total - 1) {
      parts[i] += "\n=== CONTINUE IN PART " + (i + 2) + "/" + total + " ===\n";
    }
  }
  return parts;
}

async function buildTree(
  root: vscode.Uri,
  opts: { maxEntries: number }
): Promise<string> {
  // simple FS walk (fast, no .gitignore sophistication)
  const rootFs = root.fsPath;
  const lines: string[] = [path.basename(rootFs)];
  const sep = "/";

  function list(dir: string): string[] {
    try {
      return fsSync.readdirSync(dir);
    } catch {
      return [];
    }
  }

  function walk(dir: string, prefix: string) {
    const items = list(path.join(rootFs, dir))
      .filter(
        (n) =>
          n !== ".git" &&
          n !== "node_modules" &&
          n !== ".dart_tool" &&
          n !== "build"
      )
      .sort((a, b) => a.localeCompare(b));
    items.forEach((name, i) => {
      const full = path.join(rootFs, dir, name);
      const rel = dir ? dir + sep + name : name;
      const stat = (() => {
        try {
          return fsSync.statSync(full);
        } catch {
          return null;
        }
      })();
      const last = i === items.length - 1;
      const mark = last ? "└── " : "├── ";
      lines.push(prefix + mark + name);
      if (stat?.isDirectory()) {
        walk(rel, prefix + (last ? "    " : "│   "));
      }
    });
  }
  walk("", "");
  return lines.join("\n");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function commonRootDir(paths: string[]): string {
  if (paths.length === 0) {return process.cwd();}
  const segs = paths.map((p) => path.resolve(p).split(path.sep));
  const minLen = Math.min(...segs.map((s) => s.length));
  const out: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const s = segs[0][i];
    if (segs.every((a) => a[i] === s)) {out.push(s);}
    else {break;}
  }
  return out.length ? out.join(path.sep) : path.parse(paths[0]).root;
}

async function aiPasteWithFixedUris(uris: vscode.Uri[]) {
  // --- config
  const cfg = vscode.workspace.getConfiguration("copyPasta");
  const maxBytesPerFile = cfg.get<number>("maxBytesPerFile")!;
  const stripMode = cfg.get<string>("stripMode") as StripMode;
  const maskSecrets = cfg.get<boolean>("maskSecrets")!;
  const tokenBudget = cfg.get<number>("tokenBudget")!;
  const includeTree = cfg.get<boolean>("includeTree")!;
  const normalizeTabsToSpaces = cfg.get<boolean>("normalizeTabsToSpaces")!;
  const splitOversizedFiles = cfg.get<boolean>("splitOversizedFiles")!;
  const oversizedChunkLines = cfg.get<number>("oversizedChunkLines")!;
  const stripDocPy = cfg.get<boolean>("stripDocstringsInPython")!;

  // --- racine = plus petit ancêtre commun
  const rootFs = commonRootDir(uris.map((u) => u.fsPath));
  const rootUri = vscode.Uri.file(rootFs);

  // --- prompt objectif
  const goal =
    (await vscode.window.showInputBox({
      title: "Small goal (1-2 lines)",
      value: "Review & refactor selected files.",
    })) || "";

  // --- lire fichiers sélectionnés (uniquement fichiers; si un dossier était passé, il a été expansé en amont)
  const metas: FileMeta[] = [];
  const fileBundles: {
    header: string;
    fenceOpen: string;
    body: string;
    fenceClose: string;
    end: string;
    meta: FileMeta;
  }[] = [];
  const errors: string[] = [];

  for (const uri of uris) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.Directory) {continue;} // sécurité
      if (stat.size > maxBytesPerFile) {continue;}

      let text = await fs.readFile(uri.fsPath, "utf8");
      text = text.replace(/\r\n/g, "\n");
      if (normalizeTabsToSpaces) {text = text.replace(/\t/g, "  ");}
      if (stripMode !== "none") {
        text = stripComments(
          text,
          languageFromExt(path.extname(uri.fsPath).toLowerCase()),
          stripMode,
          stripDocPy
        );
      }
      if (maskSecrets) {text = maskSecretsFn(text);}
      text = text.replace(/[ \t]+$/gm, "");

      const lines = text.split("\n").length;
      const bytes = Buffer.byteLength(text, "utf8");
      const rel = path.relative(rootFs, uri.fsPath).replaceAll("\\", "/");
      const lang = languageFromExt(path.extname(rel).toLowerCase());
      const hash = sha256Hex(text);

      const meta: FileMeta = { rel, lang, lines, bytes, hash };
      metas.push(meta);

      const header = `=== FILE: ${rel} | LINES:${lines} BYTES:${bytes} | LANG:${
        lang ?? "plain"
      } | HASH:sha256:${hash} ===`;
      fileBundles.push({
        header,
        fenceOpen: "```" + (lang ?? ""),
        body: text,
        fenceClose: "```",
        end: "=== END FILE ===",
        meta,
      });
    } catch (e: any) {
      errors.push(`${uri.fsPath}: ${e?.message ?? e}`);
    }
  }

  if (!fileBundles.length) {
    vscode.window.showWarningMessage("No usable files in selection.");
    return;
  }

  // contexte + (éventuellement) arbre pour la racine commune
  const tree = includeTree
    ? await buildTree(rootUri, { maxEntries: 50_000 })
    : null;
  const ctx = await buildContextHeader(rootUri, metas, tree, goal);

  const parts = chunkBundles(
    ctx,
    fileBundles,
    tokenBudget,
    splitOversizedFiles,
    oversizedChunkLines
  );

  if (parts.length === 1) {
    await vscode.env.clipboard.writeText(parts[0]);
    vscode.window.showInformationMessage(
      `CopyPasta (selection) copied: ${metas.length} file(s).`
    );
  } else {
    const pick = await vscode.window.showQuickPick(
      [
        { label: `Copy All (${parts.length} parts)`, detail: "Recommended" },
        ...parts.map((_, i) => ({
          label: `Copy PART ${i + 1}/${parts.length}`,
          detail: `~${estimateTokens(parts[i])} tokens`,
        })),
      ],
      { title: "CopyPasta – Parts (selection)" }
    );
    if (!pick) {return;}
    if (pick.label.startsWith("Copy All")) {
      await vscode.env.clipboard.writeText(
        parts
          .map(
            (p, i) =>
              p +
              (i < parts.length - 1 ? "\n=== CONTINUE IN NEXT PART ===\n" : "")
          )
          .join("\n")
      );
      vscode.window.showInformationMessage(
        `CopyPasta (selection) copied: ${parts.length} parts.`
      );
    } else {
      const idx = parseInt(pick.label.split(" ")[2].split("/")[0]) - 1;
      await vscode.env.clipboard.writeText(parts[idx]);
      vscode.window.showInformationMessage(
        `CopyPasta – PART ${idx + 1}/${parts.length} copied.`
      );
    }
  }

  if (errors.length) {
    vscode.window.showWarningMessage(
      `Some selected files failed: ${errors.length}. See Output Log.`
    );
    console.log("copyPasta.aiPasteFromExplorer errors:\n" + errors.join("\n"));
  }
}

async function aiPasteFromUris(targets: vscode.Uri[]) {
  // sépare fichiers / dossiers
  const files: vscode.Uri[] = [];
  const dirs: vscode.Uri[] = [];
  for (const t of targets) {
    try {
      const s = await vscode.workspace.fs.stat(t);
      s.type & vscode.FileType.Directory ? dirs.push(t) : files.push(t);
    } catch {}
  }

  // exclusions depuis copyPasta
  const cfg = vscode.workspace.getConfiguration("copyPasta");
  const excludeGlobs = cfg.get<string[]>("exclude")!;

  // set final (fichiers + contenu récursif de chaque dossier)
  const includeSet = new Set<string>(files.map((f) => f.fsPath));

  for (const d of dirs) {
    const rel = new vscode.RelativePattern(d, "**/*");
    const exc = new vscode.RelativePattern(d, mergeExcludes(excludeGlobs));
    const found = await vscode.workspace.findFiles(rel, exc, 100_000);
    found.forEach((u) => includeSet.add(u.fsPath));
  }

  const uris = uniq(Array.from(includeSet)).map((p) => vscode.Uri.file(p));
  if (!uris.length) {
    vscode.window.showWarningMessage("Nothing to include from selection.");
    return;
  }
  await aiPasteWithFixedUris(uris);
}

async function copyTreeFromUris(targets: vscode.Uri[]) {
  // Si plusieurs dossiers sélectionnés: génère un arbre par dossier, concaténé
  const dirs: vscode.Uri[] = [];
  for (const t of targets) {
    try {
      const s = await vscode.workspace.fs.stat(t);
      if (s.type & vscode.FileType.Directory) {dirs.push(t);}
    } catch {}
  }
  if (!dirs.length) {
    vscode.window.showWarningMessage("Select at least one folder.");
    return;
  }

  let out = "";
  for (const d of dirs) {
    const tree = await buildTree(d, { maxEntries: 50000 });
    out += "```text\n" + tree + "\n```\n\n";
  }
  await vscode.env.clipboard.writeText(out.trimEnd());
  vscode.window.showInformationMessage(
    `Tree copied for ${dirs.length} folder(s).`
  );
}
