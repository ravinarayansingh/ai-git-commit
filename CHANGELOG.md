# Changelog

## 0.4.0

- New `gitCommitAI.diffScope` setting: `staged-and-unpushed` generates the message from your unpushed local commits **plus** the staged changes (diff against the upstream branch) — handy before amending or squashing. Default remains `staged`. Falls back to staged-only when the branch has no upstream or nothing is ahead

## 0.3.1

- Generated messages now include an explanatory body (what changed and why, wrapped at 72 chars, bullets for multiple changes) instead of a single subject line; `maxTokens` default raised 200 → 600 to make room

## 0.3.0

- **Commit convention detection**: projects using semantic-release, commitizen, commitlint, standard-version, release-please, or cocogitto (via `pyproject.toml`, `package.json`, commitlint configs, `.releaserc*`, `.versionrc*`, `cog.toml`, …) now get Conventional Commits messages with the project's allowed types; custom `type-enum` / `allowed_tags` lists are honored. Falls back to inferring the style from recent git history. Control with `gitCommitAI.commitStyle` (`auto` | `conventional` | `plain`)
- **Stronger CLI detection**: `where` on Windows / `command -v` through your login shell on macOS & Linux (finds nvm/volta-managed installs), Windows `.exe`/`.cmd`/`.bat` handling including npm shims, and per-platform well-known install directories

## 0.2.0

- New agent CLI providers: generate commit messages with **Claude Code** (`claude -p`) or the **Codex CLI** (`codex exec`) using your existing subscription — no endpoint or API key required
- Setup panel gains a provider selector with auto-detection of installed CLIs (PATH + common install locations; `gitCommitAI.claudePath` / `gitCommitAI.codexPath` overrides)
- Progress notification names the provider; agent runs are cancellable with a 120s timeout

## 0.1.1

- Rename to "AI Git Commit Generator"; clarify that any OpenAI-compatible endpoint works (Ollama, vLLM, SGLang, LM Studio, OpenAI, …)

## 0.1.0

Initial release.

- Generate commit messages from staged changes via any OpenAI-compatible API (Ollama, vLLM, OpenAI, …)
- Guided setup panel with endpoint connection test and model picker
- API key stored in VS Code Secret Storage
- Gold sparkle button in the Source Control toolbar and Changes context menu
- Cancellable generation with request timeout
- Multi-root / multi-repository support
- Large diffs truncated safely before sending
