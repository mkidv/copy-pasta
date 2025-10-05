# Code-Sauce Changelog

## [0.6.0] - 2025-10-05

### Added

- **.gitignore support** with recursive resolution (mirrors Git behavior).hierarchically (like Git), automatically excluding ignored files and folders from bundles and trees.
- **Binary file detection:** to skip non-text files automatically.
- **Remote workspace compatibility** (SSH, WSL, Dev Containers).
- **New Config options**:
  - `sauceCode.detectBinary`: skip binary files using heuristic detection.
  - `sauceCode.useGitignore`: enable or disable `.gitignore` awareness.

### Changed

- Refactored `buildTree` to support pluggable skip predicates.
- Unified exclusion logic across all commands.
- Slightly improved token estimation consistency across bundles.

### Fixed

- Remote workspace crashes.
- Fixed potential race condition when filtering ignored files.

## [0.5.0] - 2025-10-02

### Changed

- Rebrand **CopyPasta** to **SauceCode** (command IDs, config keys, display name).

---

## [0.4.0] - 2025-10-02

### Added

- Introduced **history support** for AI Paste.
- Added **copy next for bundles**, enabling incremental copy of multi-part bundles.

### Changed

- Multiple internal refactors and stability improvements.

---

## [0.3.2] - 2025-10-01

### Fixed

- Improve exclusion handling for generated files (`*.freezed.dart`, `*.g.dart`, `.pb.dart`).
- Correctly apply `sauceCode.exclude` patterns during folder and tree copy.

---

## [0.3.1] - 2025-10-01

### Fixed

- Better handling of oversized files split into chunks.
- Minor bug fixes around Explorer integration.

---

## [0.3.0] - 2025-10-01

### Added

- **Compact blank lines** option: collapse multiple blank lines in output.
- New configuration options:
  - `sauceCode.stripDocstringsInPython`
  - `sauceCode.normalizeTabsToSpaces`
  - `sauceCode.folderCopyMode`

### Changed

- Large refactor and optimization of the core bundling logic.

---

## [0.2.0] - 2025-10-01

### Added

- **AI Paste Mode** with project context header (project info, git state, file TOC).
- **Secret masking** (API keys, JWT, PEM, etc.).
- **Token-aware chunking** (split long pastes into PART 1/2/…).
- **Explorer integration** (multi-select support).
- **Copy Tree** command.

---

## [0.1.0] - 2025-09

- Initial release with basic file copy including file banners.
