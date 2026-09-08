import * as vscode from 'vscode';

interface ModelsResponse {
  data: Array<{ id: string }>;
}

type WebviewMessage =
  | { type: 'fetchModels'; url: string; apiKey: string }
  | { type: 'save'; url: string; apiKey: string; model: string };

type ExtensionMessage =
  | { type: 'initialConfig'; url: string; apiKey: string; model: string }
  | { type: 'modelsLoaded'; models: string[] }
  | { type: 'fetchError'; message: string };

export class SetupPanel {
  private static current: SetupPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;

  static show(context: vscode.ExtensionContext): void {
    if (SetupPanel.current) {
      SetupPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'gitCommitAISetup',
      'AI Commit — Setup',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    SetupPanel.current = new SetupPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;
    this.panel.webview.html = this.buildHtml();

    // Send current saved values so the form pre-fills on re-open
    const cfg = vscode.workspace.getConfiguration('gitCommitAI');
    const init: ExtensionMessage = {
      type: 'initialConfig',
      url: cfg.get<string>('apiUrl', ''),
      apiKey: cfg.get<string>('apiKey', ''),
      model: cfg.get<string>('model', ''),
    };
    this.panel.webview.postMessage(init);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => {
        if (msg.type === 'fetchModels') {
          this.onFetchModels(msg.url, msg.apiKey);
        } else if (msg.type === 'save') {
          this.onSave(msg.url, msg.apiKey, msg.model);
        }
      },
      undefined,
      context.subscriptions
    );

    this.panel.onDidDispose(() => {
      SetupPanel.current = undefined;
    });
  }

  private async onFetchModels(url: string, apiKey: string): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const response = await fetch(`${url.replace(/\/$/, '')}/models`, { headers });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      const json = (await response.json()) as ModelsResponse;
      const models = json.data?.map((m) => m.id).filter(Boolean) ?? [];
      if (models.length === 0) {
        throw new Error('No models returned by the server.');
      }
      const msg: ExtensionMessage = { type: 'modelsLoaded', models };
      this.panel.webview.postMessage(msg);
    } catch (err) {
      const msg: ExtensionMessage = { type: 'fetchError', message: (err as Error).message };
      this.panel.webview.postMessage(msg);
    }
  }

  private async onSave(url: string, apiKey: string, model: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('gitCommitAI');
    await cfg.update('apiUrl', url, vscode.ConfigurationTarget.Global);
    await cfg.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    await cfg.update('model', model, vscode.ConfigurationTarget.Global);
    await this.context.globalState.update('setupComplete', true);
    vscode.window.showInformationMessage(`AI Commit ready — using model "${model}"`);
    this.panel.dispose();
  }

  private buildHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AI Commit Setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    display: flex;
    justify-content: center;
  }

  .card {
    margin: 40px 16px;
    width: 100%;
    max-width: 520px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #454545));
    padding: 32px 28px 28px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 28px;
  }

  .card-header .icon {
    font-size: 20px;
  }

  .card-header h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .card-header p {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .divider {
    border: none;
    border-top: 1px solid var(--vscode-panel-border, #454545);
    margin: 0 -28px 24px;
  }

  .field { margin-bottom: 16px; }

  .field label {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .field .hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-left: 4px;
    font-weight: 400;
  }

  .input-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .input-row input { margin-bottom: 0; flex: 1; }

  input[type="text"],
  input[type="url"],
  input[type="password"],
  select {
    width: 100%;
    padding: 5px 8px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    outline: none;
  }

  input:focus, select:focus {
    border-color: var(--vscode-focusBorder);
  }

  input::placeholder { color: var(--vscode-input-placeholderForeground); }

  select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 28px;
  }

  button {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    border: none;
    cursor: pointer;
    padding: 5px 12px;
    white-space: nowrap;
  }

  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .btn-primary {
    width: 100%;
    padding: 7px 12px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    margin-top: 8px;
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  button:disabled { opacity: 0.45; cursor: not-allowed; }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
    margin-bottom: 4px;
    font-size: 12px;
  }

  .status-bar.error { color: var(--vscode-errorForeground); }
  .status-bar.success { color: var(--vscode-terminal-ansiGreen, #89d185); }
  .status-bar.info { color: var(--vscode-descriptionForeground); }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--vscode-descriptionForeground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  #model-field { display: none; }
</style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <span class="icon">✦</span>
    <div>
      <h2>AI Commit Message Generator</h2>
      <p>Configure your API endpoint and model</p>
    </div>
  </div>
  <hr class="divider"/>

  <div class="field">
    <label for="url">API Endpoint URL</label>
    <div class="input-row">
      <input id="url" type="url"
        placeholder="http://localhost:11434/v1"
        autocomplete="off" spellcheck="false"/>
      <button class="btn-secondary" id="fetch-btn">Connect</button>
    </div>
  </div>

  <div class="field">
    <label for="apiKey">
      API Key <span class="hint">(optional)</span>
    </label>
    <input id="apiKey" type="password"
      placeholder="Leave blank if your endpoint does not require one"/>
  </div>

  <div class="status-bar" id="status"></div>

  <div class="field" id="model-field">
    <label for="model">Model</label>
    <select id="model"></select>
  </div>

  <button class="btn-primary" id="save-btn" disabled>Save Configuration</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  const urlEl     = document.getElementById('url');
  const keyEl     = document.getElementById('apiKey');
  const fetchBtn  = document.getElementById('fetch-btn');
  const modelSel  = document.getElementById('model');
  const modelField = document.getElementById('model-field');
  const saveBtn   = document.getElementById('save-btn');
  const statusEl  = document.getElementById('status');

  function setStatus(text, type, spinning) {
    statusEl.className = 'status-bar ' + (type || '');
    statusEl.innerHTML = (spinning ? '<span class="spinner"></span>' : '') +
      '<span>' + text + '</span>';
  }

  function clearStatus() { statusEl.className = 'status-bar'; statusEl.innerHTML = ''; }

  fetchBtn.addEventListener('click', () => {
    const url = urlEl.value.trim();
    if (!url) { setStatus('Enter an API URL first.', 'error', false); return; }
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Connecting…';
    saveBtn.disabled = true;
    modelField.style.display = 'none';
    setStatus('Connecting to ' + url, 'info', true);
    vscode.postMessage({ type: 'fetchModels', url, apiKey: keyEl.value.trim() });
  });

  saveBtn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'save',
      url: urlEl.value.trim(),
      apiKey: keyEl.value.trim(),
      model: modelSel.value,
    });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;

    if (msg.type === 'initialConfig') {
      if (msg.url)   urlEl.value = msg.url;
      if (msg.apiKey) keyEl.value = msg.apiKey;
      return;
    }

    if (msg.type === 'modelsLoaded') {
      modelSel.innerHTML = '';
      msg.models.forEach((id, i) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = i === 0 ? id + '  (default)' : id;
        modelSel.appendChild(opt);
      });
      modelField.style.display = 'block';
      saveBtn.disabled = false;
      fetchBtn.disabled = false;
      fetchBtn.textContent = 'Connect';
      setStatus('Found ' + msg.models.length + ' model' + (msg.models.length !== 1 ? 's' : '') + '.', 'success', false);
      return;
    }

    if (msg.type === 'fetchError') {
      fetchBtn.disabled = false;
      fetchBtn.textContent = 'Connect';
      setStatus(msg.message, 'error', false);
      return;
    }
  });
</script>
</body>
</html>`;
  }
}
