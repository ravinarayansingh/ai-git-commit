// Runs inside the Extension Development Host.
const assert = require('assert');
const http = require('http');
const vscode = require('vscode');

function startMockServer() {
  return new Promise((resolve) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        requests.push({ url: req.url, headers: req.headers, body });
        res.setHeader('Content-Type', 'application/json');
        if (req.url.endsWith('/chat/completions')) {
          // fenced output exercises the markdown-stripping path
          res.end(
            JSON.stringify({
              choices: [{ message: { content: '```\nfeat: add hello file\n```' } }],
            })
          );
        } else if (req.url.endsWith('/models')) {
          res.end(JSON.stringify({ data: [{ id: 'test-model' }] }));
        } else {
          res.statusCode = 404;
          res.end('not found');
        }
      });
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, requests, port: server.address().port })
    );
  });
}

async function waitFor(fn, label, timeoutMs = 20000, interval = 200) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

exports.run = async function () {
  const checks = [];
  const pass = (name) => {
    checks.push(name);
    console.log(`  PASS  ${name}`);
  };

  // 1. Extension loads and activates
  const ext = vscode.extensions.getExtension('ravinarayansingh.git-commit-ai');
  assert.ok(ext, 'extension ravinarayansingh.git-commit-ai not found in host');
  await ext.activate();
  assert.ok(ext.isActive, 'extension failed to activate');
  pass('extension activates');

  // 2. Commands are registered
  const cmds = await vscode.commands.getCommands(true);
  assert.ok(cmds.includes('gitCommitAI.generate'), 'generate command missing');
  assert.ok(cmds.includes('gitCommitAI.setup'), 'setup command missing');
  pass('commands registered (generate, setup)');

  // 3. Point config at a local mock OpenAI-compatible endpoint
  const { server, requests, port } = await startMockServer();
  const cfg = vscode.workspace.getConfiguration('gitCommitAI');
  await cfg.update('apiUrl', `http://127.0.0.1:${port}/v1`, vscode.ConfigurationTarget.Global);
  await cfg.update('model', 'test-model', vscode.ConfigurationTarget.Global);
  pass('config updated to mock endpoint');

  // 4. Wait for the git extension to discover the staged workspace repo
  const gitExt = vscode.extensions.getExtension('vscode.git');
  assert.ok(gitExt, 'built-in git extension missing');
  await gitExt.activate();
  const api = gitExt.exports.getAPI(1);
  const repo = await waitFor(() => api.repositories[0], 'git repository discovery');
  await waitFor(() => repo.state.indexChanges.length > 0, 'staged changes to appear');
  pass('git repo discovered with staged changes');

  // 5. End-to-end: run the command, message lands in the commit input box
  await vscode.commands.executeCommand('gitCommitAI.generate');
  await waitFor(() => repo.inputBox.value, 'commit input box to be filled');
  assert.strictEqual(
    repo.inputBox.value,
    'feat: add hello file',
    `unexpected commit message: ${JSON.stringify(repo.inputBox.value)}`
  );
  pass('generate fills SCM input box (markdown fences stripped)');

  // 6. Inspect what was actually sent to the API
  const genReq = requests.find((r) => r.url.endsWith('/chat/completions'));
  assert.ok(genReq, 'no /chat/completions request received');
  const payload = JSON.parse(genReq.body);
  assert.strictEqual(payload.model, 'test-model');
  assert.strictEqual(payload.messages[0].role, 'system', 'instructions not sent as system message');
  assert.strictEqual(payload.messages[1].role, 'user');
  assert.ok(
    payload.messages[1].content.includes('hello $& world'),
    '$& in diff was corrupted or diff missing from user message'
  );
  assert.ok(payload.max_tokens <= 4096, `max_tokens ${payload.max_tokens} exceeds declared max`);
  assert.ok(!genReq.headers.authorization, 'unexpected Authorization header with no key saved');
  pass('request payload correct (system/user roles, intact $& diff, max_tokens, no auth header)');

  server.close();
  console.log(`\nAll ${checks.length} integration checks passed.`);
};
