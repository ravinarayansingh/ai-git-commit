import * as vscode from 'vscode';

interface GitExtensionAPI {
  repositories: Repository[];
}

interface Repository {
  rootUri: vscode.Uri;
  state: { indexChanges: unknown[] };
  diff(staged: boolean): Promise<string>;
  inputBox: { value: string };
}

export interface StagedInfo {
  diff: string;
  inputBox: { value: string };
}

const MAX_DIFF_CHARS = 30_000;

/** Cap huge diffs (lockfiles, vendored dirs) before they hit the model's context limit. */
function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) {
    return diff;
  }
  // Cut at the last file boundary below the cap so we don't end mid-hunk.
  const boundary = diff.lastIndexOf('\ndiff --git ', MAX_DIFF_CHARS);
  const cut = boundary > 0 ? boundary : MAX_DIFF_CHARS;
  const omitted = diff.length - cut;
  return `${diff.slice(0, cut)}\n\n[Diff truncated: ${omitted} more characters omitted]`;
}

async function resolveRepository(api: GitExtensionAPI, rootUri?: vscode.Uri): Promise<Repository> {
  if (!api.repositories.length) {
    throw new Error('No git repository found in the current workspace.');
  }

  if (rootUri) {
    const match = api.repositories.find((r) => r.rootUri.toString() === rootUri.toString());
    if (match) {
      return match;
    }
  }

  if (api.repositories.length === 1) {
    return api.repositories[0];
  }

  // Command palette invocation in a multi-repo workspace: let the user pick.
  const picked = await vscode.window.showQuickPick(
    api.repositories.map((r) => ({ label: vscode.workspace.asRelativePath(r.rootUri), repo: r })),
    { placeHolder: 'Select the repository to generate a commit message for' }
  );
  if (!picked) {
    throw new Error('No repository selected.');
  }
  return picked.repo;
}

export async function getStagedInfo(rootUri?: vscode.Uri): Promise<StagedInfo> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    throw new Error('VSCode built-in Git extension not found.');
  }

  if (!gitExtension.isActive) {
    await gitExtension.activate();
  }

  const api: GitExtensionAPI | undefined = gitExtension.exports?.getAPI?.(1);
  if (!api) {
    throw new Error('VSCode Git extension is disabled. Enable it to use this extension.');
  }

  const repo = await resolveRepository(api, rootUri);

  if (!repo.state.indexChanges.length) {
    throw new Error('No staged changes found. Stage some files before generating a commit message.');
  }

  const diff = await repo.diff(true);

  if (!diff.trim()) {
    throw new Error('Staged diff is empty. Nothing to generate a commit message from.');
  }

  return { diff: truncateDiff(diff), inputBox: repo.inputBox };
}
