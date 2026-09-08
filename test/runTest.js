// Launches a real Extension Development Host (the programmatic F5) against a
// scratch git repo with a staged change, then runs test/suite/index.js inside it.
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite');

  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'gitcommitai-test-'));
  cp.execSync('git init -b main', { cwd: ws });
  cp.execSync('git config user.email test@example.com', { cwd: ws });
  cp.execSync('git config user.name Test', { cwd: ws });
  // `$&` in the content exercises the old replace() corruption bug
  fs.writeFileSync(path.join(ws, 'hello.txt'), 'hello $& world\n');
  cp.execSync('git add hello.txt', { cwd: ws });

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [ws, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
  });
}

main().catch((err) => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
