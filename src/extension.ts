import * as vscode from 'vscode';
import { API_KEY_SECRET, getConfig } from './config';
import { getStagedInfo } from './gitHelper';
import { generateCommitMessage } from './commitGenerator';
import { conventionInstruction, detectConvention } from './commitConvention';
import { SetupPanel } from './setupPanel';

/** One-time move of the legacy plaintext apiKey setting into SecretStorage. */
async function migrateApiKeyToSecrets(context: vscode.ExtensionContext): Promise<void> {
  try {
    const cfg = vscode.workspace.getConfiguration('gitCommitAI');
    const legacyKey = cfg.inspect<string>('apiKey')?.globalValue;
    if (legacyKey) {
      await context.secrets.store(API_KEY_SECRET, legacyKey);
      await cfg.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
    }
  } catch {
    // The setting is no longer contributed; clearing it may fail on some setups.
  }
}

export function activate(context: vscode.ExtensionContext) {
  void migrateApiKeyToSecrets(context);

  const setupComplete = context.globalState.get<boolean>('setupComplete', false);
  if (!setupComplete) {
    void vscode.window
      .showInformationMessage('AI Commit: configure your API endpoint and model to get started.', 'Open Setup')
      .then((selection) => {
        if (selection) {
          SetupPanel.show(context);
        }
      });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('gitCommitAI.setup', () => SetupPanel.show(context))
  );

  let generating = false;

  const disposable = vscode.commands.registerCommand(
    'gitCommitAI.generate',
    async (sourceControl?: vscode.SourceControl) => {
      if (generating) {
        vscode.window.showInformationMessage('Git Commit AI: a commit message is already being generated.');
        return;
      }
      generating = true;

      try {
        const config = getConfig();

        let stagedInfo: Awaited<ReturnType<typeof getStagedInfo>>;

        try {
          stagedInfo = await getStagedInfo(sourceControl?.rootUri, config.diffScope);
        } catch (err) {
          vscode.window.showWarningMessage(`Git Commit AI: ${(err as Error).message}`);
          return;
        }

        const apiKey = await context.secrets.get(API_KEY_SECRET);

        let instruction: string | undefined;
        try {
          const convention = await detectConvention(stagedInfo.rootUri.fsPath, config.commitStyle);
          instruction = convention ? conventionInstruction(convention) : undefined;
        } catch {
          // best-effort — a detection failure must never block generation
        }

        const controller = new AbortController();
        let cancelled = false;

        const providerLabel =
          config.provider === 'claude' ? ' via Claude Code' : config.provider === 'codex' ? ' via Codex' : '';

        let message: string;
        try {
          message = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Generating commit message${providerLabel}…`,
              cancellable: true,
            },
            (_progress, token) => {
              token.onCancellationRequested(() => {
                cancelled = true;
                controller.abort();
              });
              return generateCommitMessage(stagedInfo.diff, config, apiKey, controller.signal, instruction);
            }
          );
        } catch (err) {
          if (!cancelled) {
            vscode.window.showErrorMessage(`Git Commit AI: ${(err as Error).message}`);
          }
          return;
        }

        if (stagedInfo.inputBox.value.trim()) {
          const choice = await vscode.window.showWarningMessage(
            'Replace the existing commit message?',
            'Replace',
            'Cancel'
          );
          if (choice !== 'Replace') {
            return;
          }
        }

        stagedInfo.inputBox.value = message;
      } finally {
        generating = false;
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
