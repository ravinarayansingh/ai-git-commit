import * as vscode from 'vscode';
import { CommitStyle } from './commitConvention';

export const API_KEY_SECRET = 'gitCommitAI.apiKey';

export type Provider = 'api' | 'claude' | 'codex';

export type DiffScope = 'staged' | 'staged-and-unpushed';

export interface Config {
  provider: Provider;
  claudePath: string;
  codexPath: string;
  commitStyle: CommitStyle;
  diffScope: DiffScope;
  apiUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('gitCommitAI');
  return {
    provider: cfg.get<Provider>('provider', 'api'),
    claudePath: cfg.get<string>('claudePath', '').trim(),
    codexPath: cfg.get<string>('codexPath', '').trim(),
    commitStyle: cfg.get<CommitStyle>('commitStyle', 'auto'),
    diffScope: cfg.get<DiffScope>('diffScope', 'staged'),
    apiUrl: cfg.get<string>('apiUrl', 'http://localhost:11434/v1').trim().replace(/\/+$/, ''),
    model: cfg.get<string>('model', 'gpt-oss:latest'),
    maxTokens: cfg.get<number>('maxTokens', 600),
    temperature: cfg.get<number>('temperature', 0.3),
    systemPrompt: cfg.get<string>(
      'systemPrompt',
      'You are an expert developer. Given the following git diff of staged changes, write a complete git commit message:\n' +
        '- Subject line: concise and imperative, max 72 characters.\n' +
        '- Then a blank line, then a body that explains WHAT was changed and WHY, wrapped at 72 characters. Use short bullet points (- ) when there are multiple changes.\n' +
        '- Explain intent and impact, not a mechanical restatement of the diff. Mention behavior changes, fixed problems, and reasons for the approach.\n' +
        '- When the diff mixes substantive code changes with incidental chores (formatting, comments, renames, config or dependency tweaks), the subject line MUST describe the most significant change — a bug fix or new behavior always outranks a chore, regardless of which change is larger or appears last in the diff. Cover the minor chores briefly in the body.\n' +
        '- Skip the body only when the change is truly trivial (typo, formatting).\n' +
        'Output only the commit message text, nothing else.\n\nDiff:\n{diff}'
    ),
  };
}
