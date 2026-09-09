import * as vscode from 'vscode';
import * as cp from 'child_process';
import { DiffScope } from './config';

interface GitExtensionAPI {
  repositories: Repository[];
  git?: { path: string };
}

interface Repository {
  rootUri: vscode.Uri;
  state: {
    indexChanges: unknown[];
    HEAD?: { ahead?: number; upstream?: { remote: string; name: string } };
  };
  diff(staged: boolean): Promise<string>;
  inputBox: { value: string };
}

export interface StagedInfo {
  diff: string;
  inputBox: { value: string };
  rootUri: vscode.Uri;
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

/** Diff from the upstream ref to the index: unpushed commits + staged changes. */
function diffAgainstUpstream(gitPath: string, cwd: string, upstreamRef: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      gitPath,
      ['diff', '--cached', upstreamRef],
      { cwd, timeout: 15_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

export async function getStagedInfo(rootUri?: vscode.Uri, scope: DiffScope = 'staged'): Promise<StagedInfo> {
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

  const head = repo.state.HEAD;
  const wantUnpushed =
    scope === 'staged-and-unpushed' && Boolean(head?.upstream) && (head?.ahead ?? 0) > 0;

  if (!repo.state.indexChanges.length && !wantUnpushed) {
    throw new Error('No staged changes found. Stage some files before generating a commit message.');
  }

  let diff = '';
  if (wantUnpushed && head?.upstream) {
    const upstreamRef = `${head.upstream.remote}/${head.upstream.name}`;
    try {
      diff = await diffAgainstUpstream(api.git?.path ?? 'git', repo.rootUri.fsPath, upstreamRef);
    } catch {
      // upstream ref missing or git call failed — fall back to the staged diff
    }
  }
  if (!diff.trim()) {
    diff = await repo.diff(true);
  }

  if (!diff.trim()) {
    throw new Error('Staged diff is empty. Nothing to generate a commit message from.');
  }

  return { diff: truncateDiff(diff), inputBox: repo.inputBox, rootUri: repo.rootUri };
}
