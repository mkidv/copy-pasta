import type { Lang } from "../core/lang";

export type StripMode = "none" | "safe" | "keep-doc";

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
]);
const hashLike = new Set(["python", "bash", "yaml", "toml"]);
const sqlLike = new Set(["sql"]);

export function stripComments(
  input: string,
  lang: Lang,
  mode: StripMode,
  stripDocPy: boolean
): string {
  if (mode === "none") {
    return input;
  }
  let text = input;
  // shebang
  let shebang = "";
  if (text.startsWith("#!")) {
    const i = text.indexOf("\n");
    shebang = i >= 0 ? text.slice(0, i + 1) : text + "\n";
    text = i >= 0 ? text.slice(i + 1) : "";
  }
  if (lang) {
    if (cLike.has(lang)) {
      text = text.replace(/\/\*[\s\S]*?\*\//g, "");
      text = text.replace(/(^|[ \t])\/\/.*$/gm, "$1");
    }
    if (hashLike.has(lang)) {
      if (mode === "safe") {
        text = text.replace(/(^|\s)#(?!\[).*$/gm, "$1");
      }
      if (mode === "keep-doc") {
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
  }
  return shebang + text;
}
