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

  // A bare origin with one pushed commit, then one unpushed commit — so the
  // staged-and-unpushed diff scope has something beyond the staged changes.
  fs.writeFileSync(path.join(ws, 'base.txt'), 'base content\n');
  cp.execSync('git add base.txt && git commit -q -m "initial commit"', { cwd: ws });
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'gitcommitai-origin-'));
  cp.execSync('git init -q --bare', { cwd: origin });
  cp.execSync(`git remote add origin "${origin}"`, { cwd: ws });
  cp.execSync('git push -q -u origin main', { cwd: ws });
  fs.writeFileSync(path.join(ws, 'feature.txt'), 'unpushed feature content\n');
  cp.execSync('git add feature.txt && git commit -q -m "add feature file"', { cwd: ws });

  // `$&` in the content exercises the old replace() corruption bug
  fs.writeFileSync(path.join(ws, 'hello.txt'), 'hello $& world\n');
  cp.execSync('git add hello.txt', { cwd: ws });
  // commitlint config with a custom type-enum exercises convention detection
  fs.writeFileSync(
    path.join(ws, '.commitlintrc.json'),
    JSON.stringify({ rules: { 'type-enum': [2, 'always', ['feat', 'fix', 'chore']] } })
  );

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
