import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

export const CONCURRENCY = 16;

export function pLimit(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    queue.shift()?.();
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= n) {
      await new Promise<void>((r) => queue.push(r));
    }
    active++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

export const limit = pLimit(CONCURRENCY);

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export function chunkByLines(text: string, linesPerChunk: number): string[] {
  if (linesPerChunk <= 0) {return [text];}
  const lines = text.split("\n");
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) {
    chunks.push(lines.slice(i, i + linesPerChunk).join("\n"));
  }
  return chunks;
}

export function commonRootDir(paths: string[]): string {
  if (!paths.length) {
    return process.cwd();
  }
  const dirs = paths.map((p) => {
    const abs = path.resolve(p);
    try {
      return fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
    } catch {
      return path.dirname(abs);
    }
  });
  const segs = dirs.map((p) => p.split(path.sep));
  const min = Math.min(...segs.map((s) => s.length));
  const out: string[] = [];
  for (let i = 0; i < min; i++) {
    const s = segs[0][i];
    if (segs.every((a) => a[i] === s)) {
      out.push(s);
    } else {
      break;
    }
  }
  return out.length ? out.join(path.sep) : path.parse(dirs[0]).root;
}

export function ensureDirPath(absPath: string): string {
  try {
    return fs.statSync(absPath).isDirectory() ? absPath : path.dirname(absPath);
  } catch {
    return path.dirname(absPath);
  }
}
