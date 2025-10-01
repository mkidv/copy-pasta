export type Lang = string | null;

export function languageFromExt(ext: string): Lang {
  switch (ext) {
    case ".ts": case ".tsx": return "ts";
    case ".js": case ".jsx": return "js";
    case ".dart": return "dart";
    case ".rs": return "rust";
    case ".py": return "python";
    case ".go": return "go";
    case ".java": return "java";
    case ".kt": return "kotlin";
    case ".c": return "c";
    case ".cc": case ".cpp": case ".cxx": return "cpp";
    case ".h": case ".hpp": return "cpp";
    case ".cs": return "csharp";
    case ".swift": return "swift";
    case ".sh": case ".bash": return "bash";
    case ".yml": case ".yaml": return "yaml";
    case ".toml": return "toml";
    case ".md": return "markdown";
    case ".sql": return "sql";
    case ".json": return "json";
    default: return null;
  }
}
