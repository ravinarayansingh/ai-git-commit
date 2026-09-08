import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Config } from './config';

export type AgentKind = 'claude' | 'codex';

export interface AgentInfo {
  found: boolean;
  path?: string;
  version?: string;
}

const AGENT_TIMEOUT_MS = 120_000;

interface AgentSpec {
  binary: string;
  label: string;
  installHint: string;
  pathSetting: 'claudePath' | 'codexPath';
  /** Args for a one-shot run; the full prompt is written to stdin. */
  buildArgs(outputFile: string): string[];
  /** Where the final answer lands: 'stdout' or the outputFile passed to buildArgs. */
  readResult(stdout: string, outputFile: string): string;
}

const AGENTS: Record<AgentKind, AgentSpec> = {
  claude: {
    binary: 'claude',
    label: 'Claude Code',
    installHint: 'Install Claude Code (https://claude.com/claude-code) or set gitCommitAI.claudePath.',
    pathSetting: 'claudePath',
    // -p print mode reads the prompt from stdin; text output has no ANSI/preamble.
    buildArgs: () => ['-p', '--output-format', 'text'],
    readResult: (stdout) => stdout,
  },
  codex: {
    binary: 'codex',
    label: 'Codex CLI',
    installHint: 'Install the Codex CLI (npm i -g @openai/codex) or set gitCommitAI.codexPath.',
    pathSetting: 'codexPath',
    // `exec -` reads the prompt from stdin; stdout carries progress noise, so the
    // final answer is captured via --output-last-message instead.
    buildArgs: (outputFile) => [
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--output-last-message',
      outputFile,
      '-',
    ],
    readResult: (stdout, outputFile) => {
      try {
        const fromFile = fs.readFileSync(outputFile, 'utf8');
        if (fromFile.trim()) {
          return fromFile;
        }
      } catch {
        // fall back to stdout
      }
      return stdout;
    },
  },
};

const IS_WINDOWS = process.platform === 'win32';

/** npm shims on Windows are .cmd files; native installs are .exe. */
function candidateNames(binary: string): string[] {
  return IS_WINDOWS ? [`${binary}.exe`, `${binary}.cmd`, `${binary}.bat`, binary] : [binary];
}

/** GUI-launched VS Code often lacks these in PATH. */
function wellKnownDirs(): string[] {
  const home = os.homedir();
  if (IS_WINDOWS) {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return [
      path.join(home, '.local', 'bin'),
      path.join(appData, 'npm'),
      path.join(localAppData, 'Programs', 'claude'),
      path.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
    ];
  }
  return [
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.claude', 'local'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, 'bin'),
  ];
}

function isRunnable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) {
      return false;
    }
    if (!IS_WINDOWS) {
      fs.accessSync(file, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask the system where the binary lives: `where` on Windows, `command -v`
 * through the user's login shell elsewhere (finds nvm/volta/profile-managed
 * installs that GUI-launched VS Code's stripped PATH misses).
 */
function lookupViaSystem(binary: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const done = (stdout: string | undefined) => {
      const first = stdout?.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      resolve(first && isRunnable(first) ? first : undefined);
    };
    if (IS_WINDOWS) {
      cp.exec(`where ${binary}`, { timeout: 5_000, windowsHide: true }, (err, stdout) =>
        done(err ? undefined : stdout)
      );
    } else {
      const shell = process.env.SHELL || '/bin/sh';
      cp.execFile(shell, ['-lc', `command -v ${binary}`], { timeout: 5_000 }, (err, stdout) =>
        done(err ? undefined : stdout)
      );
    }
  });
}

// Positive results are cached; misses are re-checked so a fresh install is
// picked up by the next attempt / "Re-check" without a reload.
const resolveCache = new Map<string, string>();

async function resolveBinary(kind: AgentKind, config: Config): Promise<string | undefined> {
  const spec = AGENTS[kind];
  const override = config[spec.pathSetting];
  const cacheKey = `${kind}:${override}`;

  const cached = resolveCache.get(cacheKey);
  if (cached && isRunnable(cached)) {
    return cached;
  }

  let found: string | undefined;
  if (override) {
    const candidates = IS_WINDOWS
      ? [override, `${override}.exe`, `${override}.cmd`, `${override}.bat`]
      : [override];
    found = candidates.find(isRunnable);
  } else {
    found = await lookupViaSystem(spec.binary);
    if (!found) {
      const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
      outer: for (const dir of [...pathDirs, ...wellKnownDirs()]) {
        for (const name of candidateNames(spec.binary)) {
          const candidate = path.join(dir, name);
          if (isRunnable(candidate)) {
            found = candidate;
            break outer;
          }
        }
      }
    }
  }

  if (found) {
    resolveCache.set(cacheKey, found);
  }
  return found;
}

/** .cmd/.bat shims can only run through a shell on Node 18+. */
function needsShell(binary: string): boolean {
  return IS_WINDOWS && /\.(cmd|bat)$/i.test(binary);
}

function getVersion(binary: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const handle = (err: Error | null, stdout: string) => {
      if (err) {
        resolve(undefined);
        return;
      }
      const match = stdout.match(/\d+\.\d+[.\d]*/);
      resolve(match ? match[0] : stdout.trim().slice(0, 40));
    };
    if (needsShell(binary)) {
      cp.exec(`"${binary}" --version`, { timeout: 10_000, windowsHide: true }, handle);
    } else {
      cp.execFile(binary, ['--version'], { timeout: 10_000 }, handle);
    }
  });
}

export async function detectAgent(kind: AgentKind, config: Config): Promise<AgentInfo> {
  const binary = await resolveBinary(kind, config);
  if (!binary) {
    return { found: false };
  }
  return { found: true, path: binary, version: await getVersion(binary) };
}

/* eslint-disable-next-line no-control-regex */
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

export async function runAgent(kind: AgentKind, prompt: string, config: Config, signal?: AbortSignal): Promise<string> {
  const spec = AGENTS[kind];
  const binary = await resolveBinary(kind, config);
  if (!binary) {
    throw new Error(`${spec.label} CLI not found. ${spec.installHint}`);
  }

  const outputFile = path.join(os.tmpdir(), `gitcommitai-${kind}-${Date.now()}.txt`);
  const args = spec.buildArgs(outputFile);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AGENT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      // cwd = tmpdir: the CLI needs no filesystem/project context — the diff is on stdin.
      // .cmd/.bat shims require a shell; quote the path and args for cmd.exe.
      const useShell = needsShell(binary);
      const child = useShell
        ? cp.spawn(`"${binary}"`, args.map((a) => `"${a}"`), {
            cwd: os.tmpdir(),
            env: process.env,
            signal: controller.signal,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            windowsHide: true,
          })
        : cp.spawn(binary, args, {
            cwd: os.tmpdir(),
            env: process.env,
            signal: controller.signal,
            stdio: ['pipe', 'pipe', 'pipe'],
          });

      let out = '';
      let errOut = '';
      const cap = 1024 * 1024;
      child.stdout.on('data', (d: Buffer) => {
        if (out.length < cap) out += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        if (errOut.length < cap) errOut += d.toString();
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(new Error(`${spec.label} CLI not found at ${binary}. ${spec.installHint}`));
        } else if (err.name === 'AbortError') {
          if (timedOut) {
            reject(new Error(`${spec.label} timed out after ${AGENT_TIMEOUT_MS / 1000}s.`));
          } else {
            reject(err); // user cancellation, handled by the caller
          }
        } else {
          reject(new Error(`Failed to run ${spec.label}: ${err.message}`));
        }
      });

      child.on('close', (code) => {
        if (signal?.aborted) {
          reject(new Error('Cancelled'));
        } else if (timedOut) {
          reject(new Error(`${spec.label} timed out after ${AGENT_TIMEOUT_MS / 1000}s.`));
        } else if (code !== 0) {
          const detail = (errOut || out).trim().split('\n').slice(-4).join('\n');
          reject(new Error(`${spec.label} exited with code ${code}${detail ? `: ${detail}` : ''}`));
        } else {
          resolve(out);
        }
      });

      child.stdin.on('error', () => undefined); // EPIPE if the CLI exits early
      child.stdin.write(prompt);
      child.stdin.end();
    });

    const raw = spec.readResult(stdout, outputFile).replace(ANSI_RE, '').trim();
    if (!raw) {
      throw new Error(`${spec.label} returned an empty response. Check that you are logged in (run "${spec.binary}" in a terminal).`);
    }
    return raw;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    fs.promises.unlink(outputFile).catch(() => undefined);
  }
}
