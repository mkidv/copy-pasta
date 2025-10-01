# 🍝 CopyPasta – serve your code al dente

CopyPasta lets you bundle multiple files or whole folders into a clean, AI-friendly paste.
It adds file banners, optional comment stripping, secret masking, and token-aware chunking — so your project context is always ready to feed your favorite AI or share in reviews.

## ✨ Features

- ### Copy with banners
  Copy selected files or folders with a banner per file:

```bash
=== FILE: src/main.dart | LINES:120 BYTES:3024 | LANG:dart ===
```

- ### AI Paste Mode
  - Optional strip comments (safe / keep-doc / none).
    -Automatic secret masking (API keys, JWTs, Firebase keys…).
  - Token-aware chunking: splits into PART 1/2/3 when too long.
  - Context header with project info, Git state, file table of contents.
- ### Copy tree
  Generate an ASCII directory tree for one or multiple folders.
- ### Explorer integration
  Right-click in VS Code’s file explorer to copy exactly what you’ve selected (multi-select supported).

---

## 🛠 Requirements

- VS Code 1.90+
- Node.js 18+ for building (if installing from source).
- No extra runtime dependencies — works out of the box.

---

## ⚙️ Extension Settings

This extension contributes the following settings (all under copyPasta.):

- defaultGlob: default file glob for AI Paste.
- exclude: additional exclude patterns.
- maxBytesPerFile: skip files larger than this.
- stripMode: none | safe | keep-doc.
- maskSecrets: automatically mask secrets.
- tokenBudget: estimated token budget per part.
- includeTree: include project tree in context header.
- …and more (see package.json).

## 🐞 Known Issues

- Comment stripping is regex-based → may be conservative.

- Multi-language AST-based stripping is planned (Tree-sitter).

- Oversized single files are split by line chunks, not syntax-aware.

## 📦 Release Notes

### 0.3.0

- Refactor & optimize
- Add compact blank lines

### 0.2.0

- Added AI Paste Mode with context header, secret masking, token-aware chunking.
- Added Explorer right-click support (multi-select).
- Added Copy Tree command.

### 0.1.0

- Initial release, basic copy with file banners.

## 📚 Example

Copying 3 Dart files into clipboard yields:

````bash === AI CONTEXT ===
Project: my-app | Git: branch=main head=abc123 clean
Langs: dart
Files: 3 | Lines: 482 | Bytes: 14923
BUNDLE-HASH: merkle-sha256: f19c3f2a1b7e8cda
=== END AI CONTEXT ===

=== FILE: lib/main.dart | LINES:120 BYTES:3024 | LANG:dart ===
```dart
// code…
=== END FILE ===
````

If too long, it automatically splits into PART 1/2/… with clear markers.

---

**CopyPasta: the Copita _al dente_** 🍝  
Your code, trimmed, sauced with context, and ready to paste.
