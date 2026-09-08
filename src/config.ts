import * as vscode from 'vscode';

export interface Config {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('gitCommitAI');
  return {
    apiUrl: cfg.get<string>('apiUrl', 'http://localhost:11434/v1').replace(/\/$/, ''),
    apiKey: cfg.get<string>('apiKey', ''),
    model: cfg.get<string>('model', 'gpt-oss:latest'),
    maxTokens: cfg.get<number>('maxTokens', 6000),
    temperature: cfg.get<number>('temperature', 0.3),
    systemPrompt: cfg.get<string>(
      'systemPrompt',
      'You are an expert developer. Given the following git diff of staged changes, write a concise, imperative commit message (max 72 chars for the subject line). Output only the commit message text, nothing else.\n\nDiff:\n{diff}'
    ),
  };
}
