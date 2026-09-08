# AI Git Commit Generator

Generate git commit messages from your staged changes using any OpenAI-compatible API — works with Ollama, vLLM, SGLang, LM Studio, OpenAI, and more.

## Features

- One-click commit message generation from the SCM toolbar (sparkle icon)
- Works with any OpenAI-compatible `/chat/completions` endpoint
- **Or use an agent CLI you already have**: Claude Code or Codex — no endpoint or API key needed
- Local-first: defaults to Ollama at `http://localhost:11434/v1`
- API keys stored securely in VS Code Secret Storage (never in plaintext settings)
- Guided setup panel that lists the models available on your endpoint
- Cancellable generation with a request timeout
- Multi-root / multi-repository aware

## Providers

Pick one in the setup panel (**AI: Configure API & Model**):

| Provider | What you need | How it works |
| --- | --- | --- |
| **API Endpoint** (default) | Any OpenAI-compatible endpoint: Ollama, vLLM, SGLang, LM Studio, OpenAI, … | HTTP call to `/chat/completions`; API key (if any) stored in Secret Storage |
| **Claude Code** | The [Claude Code](https://claude.com/claude-code) CLI installed and logged in | Runs `claude -p` locally; uses your existing Claude subscription |
| **Codex CLI** | The [Codex CLI](https://github.com/openai/codex) installed and logged in (`npm i -g @openai/codex`) | Runs `codex exec` locally; uses your existing ChatGPT/OpenAI login |

Installed CLIs are auto-detected (PATH plus common install locations). If yours lives somewhere unusual, set `gitCommitAI.claudePath` / `gitCommitAI.codexPath`.

## Requirements

- VS Code 1.85+
- One of: an OpenAI-compatible API endpoint (e.g. [Ollama](https://ollama.com) running `ollama serve`), the Claude Code CLI, or the Codex CLI

## Getting Started

1. Install the extension.
2. Run **AI: Configure API & Model** from the Command Palette (or follow the setup notification on first launch).
3. Pick a provider. For an API endpoint: enter the URL, an API key if needed, press **Connect**, and pick a model. For Claude Code / Codex: the panel shows whether the CLI was found — just hit Save.
4. Stage some changes, then click the sparkle icon in the Source Control title bar, right-click the **Staged Changes** group, or run **AI: Generate Commit Message** from the Command Palette.

## Commit style detection

If your project uses semantic versioning tooling, generated messages automatically follow **Conventional Commits** (`feat: …`, `fix(scope): …`) with the types your project allows. Detection checks, in order:

1. Config files in the repo root: commitlint configs (custom `type-enum` types are honored), `package.json` (semantic-release / commitizen / commitlint / standard-version), `pyproject.toml` (`[tool.semantic_release]` — `allowed_tags` honored — or `[tool.commitizen]`), `.releaserc*`, `.versionrc*`, `release-please-config.json`, `cog.toml`, `.cz.*`
2. Recent git history: if most of the last 30 commit subjects already follow `type(scope): …`, the same style (and the types you actually use) is kept

Set `gitCommitAI.commitStyle` to `conventional` to force it, or `plain` to turn it off.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `gitCommitAI.provider` | `api` | `api`, `claude` (Claude Code CLI), or `codex` (Codex CLI) |
| `gitCommitAI.claudePath` | *(auto-detect)* | Explicit path to the `claude` binary |
| `gitCommitAI.codexPath` | *(auto-detect)* | Explicit path to the `codex` binary |
| `gitCommitAI.commitStyle` | `auto` | `auto` (detect Conventional Commits), `conventional` (force), or `plain` (off) |
| `gitCommitAI.apiUrl` | `http://localhost:11434/v1` | Base URL of the OpenAI-compatible API |
| `gitCommitAI.model` | `gpt-oss:latest` | Model used for generation |
| `gitCommitAI.maxTokens` | `200` | Max tokens in the generated message |
| `gitCommitAI.temperature` | `0.3` | Sampling temperature |
| `gitCommitAI.systemPrompt` | *(built-in)* | Prompt template; use `{diff}` as the placeholder for the staged diff |

The API key is not a setting — it is stored in VS Code Secret Storage via the setup panel.

## Building from Source

```bash
git clone https://github.com/ravinarayansingh/ai-git-commit.git
cd ai-git-commit
npm install
npm run compile
```

Open the folder in VS Code and press `F5` to launch an Extension Development Host.

## License

[MIT](LICENSE)
