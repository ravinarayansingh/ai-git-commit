# AI Commit Message Generator

Generate git commit messages from your staged changes using any OpenAI-compatible LLM — Ollama, vLLM, OpenAI, and more.

## Features

- One-click commit message generation from the SCM toolbar (sparkle icon)
- Works with any OpenAI-compatible `/chat/completions` endpoint
- Local-first: defaults to Ollama at `http://localhost:11434/v1`
- API keys stored securely in VS Code Secret Storage (never in plaintext settings)
- Guided setup panel that lists the models available on your endpoint
- Cancellable generation with a request timeout
- Multi-root / multi-repository aware

## Requirements

- VS Code 1.85+
- An OpenAI-compatible API endpoint, e.g.:
  - [Ollama](https://ollama.com) running locally (`ollama serve`), or
  - OpenAI / any hosted provider with an API key

## Getting Started

1. Install the extension.
2. Run **AI: Configure API & Model** from the Command Palette (or follow the setup notification on first launch).
3. Enter your API URL (e.g. `http://localhost:11434/v1`), an API key if your endpoint needs one, press **Connect**, and pick a model.
4. Stage some changes, then click the sparkle icon in the Source Control title bar, right-click the **Staged Changes** group, or run **AI: Generate Commit Message** from the Command Palette.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
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
