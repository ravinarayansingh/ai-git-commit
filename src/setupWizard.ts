import * as vscode from 'vscode';

interface ModelsResponse {
  data: Array<{ id: string }>;
}

async function fetchModels(apiUrl: string, apiKey: string): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/models`, { headers });
  } catch (err) {
    throw new Error(`Could not reach ${apiUrl}: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as ModelsResponse;
  const models = json.data?.map((m) => m.id).filter(Boolean) ?? [];
  if (models.length === 0) {
    throw new Error('No models returned by the API.');
  }
  return models;
}

export async function runSetupWizard(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('gitCommitAI');

  // Step 1 — API URL
  const currentUrl = cfg.get<string>('apiUrl', '');
  const url = await vscode.window.showInputBox({
    title: 'AI Commit Setup — Step 1 of 2: API URL',
    prompt: 'Enter the base URL of your OpenAI-compatible API endpoint',
    placeHolder: 'http://localhost:11434/v1',
    value: currentUrl,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() ? null : 'URL cannot be empty'),
  });
  if (!url) {
    return;
  }

  // Step 1b — API key (optional)
  const currentKey = cfg.get<string>('apiKey', '');
  const apiKey = await vscode.window.showInputBox({
    title: 'AI Commit Setup — Step 1b of 2: API Key (optional)',
    prompt: 'Enter your API key, or leave blank if not required',
    value: currentKey,
    password: true,
    ignoreFocusOut: true,
  });
  if (apiKey === undefined) {
    return; // user pressed Escape
  }

  // Fetch models with progress indicator
  let models: string[] = [];
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Fetching available models…' },
      async () => {
        models = await fetchModels(url.trim(), apiKey.trim());
      }
    );
  } catch (err) {
    const retry = await vscode.window.showErrorMessage(
      `AI Commit Setup: ${(err as Error).message}`,
      'Retry',
      'Cancel'
    );
    if (retry === 'Retry') {
      return runSetupWizard(context);
    }
    return;
  }

  // Step 2 — Model selection (first item pre-highlighted = default)
  const items: vscode.QuickPickItem[] = models.map((id, i) => ({
    label: id,
    description: i === 0 ? 'default' : undefined,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'AI Commit Setup — Step 2 of 2: Select Model',
    placeHolder: 'Choose a model (first one is the default)',
    ignoreFocusOut: true,
  });

  const model = picked?.label ?? models[0];

  // Persist settings globally
  await cfg.update('apiUrl', url.trim(), vscode.ConfigurationTarget.Global);
  await cfg.update('apiKey', apiKey.trim(), vscode.ConfigurationTarget.Global);
  await cfg.update('model', model, vscode.ConfigurationTarget.Global);

  await context.globalState.update('setupComplete', true);

  vscode.window.showInformationMessage(
    `AI Commit ready — using model "${model}" at ${url.trim()}`
  );
}
