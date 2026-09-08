import * as vscode from 'vscode';

interface GitExtensionAPI {
  repositories: Repository[];
}

interface Repository {
  state: { indexChanges: unknown[] };
  diff(staged: boolean): Promise<string>;
  inputBox: { value: string };
}

export interface StagedInfo {
  diff: string;
  inputBox: { value: string };
}

export async function getStagedInfo(): Promise<StagedInfo> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    throw new Error('VSCode built-in Git extension not found.');
  }

  if (!gitExtension.isActive) {
    await gitExtension.activate();
  }

  const api: GitExtensionAPI = gitExtension.exports.getAPI(1);

  if (!api.repositories.length) {
    throw new Error('No git repository found in the current workspace.');
  }

  const repo = api.repositories[0];

  if (!repo.state.indexChanges.length) {
    throw new Error('No staged changes found. Stage some files before generating a commit message.');
  }

  const diff = await repo.diff(true);

  if (!diff.trim()) {
    throw new Error('Staged diff is empty. Nothing to generate a commit message from.');
  }

  return { diff, inputBox: repo.inputBox };
}
