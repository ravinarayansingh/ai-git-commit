import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type CommitStyle = 'auto' | 'conventional' | 'plain';

export interface Convention {
  types: string[];
  source: string;
}

const DEFAULT_TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'perf', 'build', 'ci', 'style', 'revert'];

function readIfExists(file: string, maxBytes = 256 * 1024): string | undefined {
  try {
    if (fs.statSync(file).size > maxBytes) {
      return undefined;
    }
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function exists(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Pull the allowed types out of a commitlint `type-enum` rule in a JSON config. */
function typesFromCommitlintJson(content: string): string[] | undefined {
  try {
    const parsed = JSON.parse(content) as { rules?: { 'type-enum'?: unknown[] } };
    const rule = parsed.rules?.['type-enum'];
    if (Array.isArray(rule) && Array.isArray(rule[2]) && rule[2].length) {
      return (rule[2] as unknown[]).filter((t): t is string => typeof t === 'string');
    }
  } catch {
    // not JSON — treat as presence-only
  }
  return undefined;
}

/** python-semantic-release: [tool.semantic_release.commit_parser_options] allowed_tags = [...] */
function typesFromPyprojectToml(content: string): string[] | undefined {
  const match = content.match(/allowed_tags\s*=\s*\[([^\]]*)\]/);
  if (!match) {
    return undefined;
  }
  const types = [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  return types.length ? types : undefined;
}

function detectFromConfigFiles(repoRoot: string): Convention | undefined {
  // commitlint configs — JSON variants may carry a custom type-enum.
  const commitlintJson = ['.commitlintrc', '.commitlintrc.json'];
  for (const name of commitlintJson) {
    const content = readIfExists(path.join(repoRoot, name));
    if (content !== undefined) {
      return { types: typesFromCommitlintJson(content) ?? DEFAULT_TYPES, source: name };
    }
  }
  const commitlintPresence = [
    '.commitlintrc.yml',
    '.commitlintrc.yaml',
    '.commitlintrc.js',
    '.commitlintrc.cjs',
    '.commitlintrc.ts',
    'commitlint.config.js',
    'commitlint.config.cjs',
    'commitlint.config.ts',
    'commitlint.config.mjs',
  ];
  for (const name of commitlintPresence) {
    if (exists(path.join(repoRoot, name))) {
      return { types: DEFAULT_TYPES, source: name };
    }
  }

  // package.json: semantic-release / commitizen / commitlint tooling.
  const pkgContent = readIfExists(path.join(repoRoot, 'package.json'));
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
      const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      const markers = ['@commitlint/config-conventional', '@commitlint/cli', 'semantic-release', 'commitizen', 'cz-conventional-changelog', 'standard-version'];
      const hasDep = markers.some((m) => m in deps);
      const hasKey = 'release' in pkg || 'commitlint' in pkg ||
        Boolean((pkg.config as Record<string, unknown> | undefined)?.commitizen);
      if (hasDep || hasKey) {
        return { types: DEFAULT_TYPES, source: 'package.json' };
      }
    } catch {
      // unparseable package.json — ignore
    }
  }

  // pyproject.toml: python-semantic-release or commitizen sections.
  const pyproject = readIfExists(path.join(repoRoot, 'pyproject.toml'));
  if (pyproject && /^\s*\[tool\.(semantic_release|commitizen)/m.test(pyproject)) {
    return { types: typesFromPyprojectToml(pyproject) ?? DEFAULT_TYPES, source: 'pyproject.toml' };
  }

  // Other ecosystems (presence is enough).
  const presenceFiles = [
    '.releaserc',
    '.releaserc.json',
    '.releaserc.yaml',
    '.releaserc.yml',
    '.releaserc.js',
    'release.config.js',
    'release.config.cjs',
    '.versionrc',
    '.versionrc.json',
    'release-please-config.json',
    'cog.toml',
    '.cz.toml',
    '.cz.json',
  ];
  for (const name of presenceFiles) {
    if (exists(path.join(repoRoot, name))) {
      return { types: DEFAULT_TYPES, source: name };
    }
  }

  return undefined;
}

const SUBJECT_RE = /^(\w+)(\([^)]*\))?!?:\s/;

/** Infer the convention from recent commit subjects — works for any language/tooling. */
function detectFromGitHistory(repoRoot: string): Promise<Convention | undefined> {
  return new Promise((resolve) => {
    cp.execFile(
      'git',
      ['log', '--no-merges', '--format=%s', '-30'],
      { cwd: repoRoot, timeout: 5_000 },
      (err, stdout) => {
        if (err) {
          resolve(undefined);
          return;
        }
        const subjects = stdout.split('\n').filter(Boolean);
        if (subjects.length < 5) {
          resolve(undefined);
          return;
        }
        const typeCounts = new Map<string, number>();
        let matches = 0;
        for (const subject of subjects) {
          const m = subject.match(SUBJECT_RE);
          if (m) {
            matches++;
            const type = m[1].toLowerCase();
            typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
          }
        }
        if (matches / subjects.length < 0.6) {
          resolve(undefined);
          return;
        }
        const observed = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
        // Merge with defaults so the model isn't boxed into a tiny observed set.
        const types = [...new Set([...observed, ...DEFAULT_TYPES])].slice(0, 12);
        resolve({ types, source: 'recent git history' });
      }
    );
  });
}

export async function detectConvention(repoRoot: string, style: CommitStyle): Promise<Convention | undefined> {
  if (style === 'plain') {
    return undefined;
  }
  if (style === 'conventional') {
    return { types: DEFAULT_TYPES, source: 'gitCommitAI.commitStyle setting' };
  }
  return detectFromConfigFiles(repoRoot) ?? (await detectFromGitHistory(repoRoot));
}

export function conventionInstruction(convention: Convention): string {
  return (
    `This project uses Conventional Commits (detected from ${convention.source}). ` +
    `Format the subject line as "type(optional-scope): description" using one of these types: ` +
    `${convention.types.join(', ')}. Keep the explanatory body after the subject line.`
  );
}
