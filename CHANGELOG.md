# Changelog

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
