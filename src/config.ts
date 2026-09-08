import * as vscode from 'vscode';

export const API_KEY_SECRET = 'gitCommitAI.apiKey';

export type Provider = 'api' | 'claude' | 'codex';

export interface Config {
  provider: Provider;
  claudePath: string;
  codexPath: string;
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
    apiUrl: cfg.get<string>('apiUrl', 'http://localhost:11434/v1').trim().replace(/\/+$/, ''),
    model: cfg.get<string>('model', 'gpt-oss:latest'),
    maxTokens: cfg.get<number>('maxTokens', 200),
    temperature: cfg.get<number>('temperature', 0.3),
    systemPrompt: cfg.get<string>(
      'systemPrompt',
      'You are an expert developer. Given the following git diff of staged changes, write a concise, imperative commit message (max 72 chars for the subject line). Output only the commit message text, nothing else.\n\nDiff:\n{diff}'
    ),
  };
}
