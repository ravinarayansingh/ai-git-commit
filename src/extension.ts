import * as vscode from 'vscode';
import { getConfig } from './config';
import { getStagedInfo } from './gitHelper';
import { generateCommitMessage } from './commitGenerator';
import { SetupPanel } from './setupPanel';

export function activate(context: vscode.ExtensionContext) {
  // Auto-open setup panel on first install
  const setupComplete = context.globalState.get<boolean>('setupComplete', false);
  const configuredUrl = vscode.workspace.getConfiguration('gitCommitAI').get<string>('apiUrl', '');
  if (!setupComplete || !configuredUrl) {
    SetupPanel.show(context);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('gitCommitAI.setup', () => SetupPanel.show(context))
  );

  const disposable = vscode.commands.registerCommand('gitCommitAI.generate', async () => {
    let stagedInfo: Awaited<ReturnType<typeof getStagedInfo>>;

    try {
      stagedInfo = await getStagedInfo();
    } catch (err) {
      vscode.window.showWarningMessage(`Git Commit AI: ${(err as Error).message}`);
      return;
    }

    const config = getConfig();

    let message: string;
    try {
      message = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating commit message…',
          cancellable: false,
        },
        () => generateCommitMessage(stagedInfo.diff, config)
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Git Commit AI: ${(err as Error).message}`);
      return;
    }

    stagedInfo.inputBox.value = message;
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
