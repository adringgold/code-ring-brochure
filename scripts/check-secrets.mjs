#!/usr/bin/env node
// Blocks commits that contain secrets, real data or a personal email address.
//
//   node scripts/check-secrets.mjs            check what's staged (the pre-commit hook runs this)
//   node scripts/check-secrets.mjs --all      check every tracked file
//   node scripts/check-secrets.mjs --install  point git at .githooks (run by `npm install` via "prepare")
//
// A line that is a known false positive can be allowed with a "secret-check: allow" comment.
// The Firebase web config (apiKey "AIza...") is public by design and is not flagged.
//
// Real names and exact figures can't be spotted by a pattern, so they go in a list: one per line in the
// git-ignored samples/blocked-terms.txt (blank lines and lines starting with # are skipped). A file that holds
// one, in any letter case, or whose name holds one, is refused, and an allow comment doesn't change that. The report names the line of the list that matched, never the term
// itself. Write each term the way it would appear (a figure with its commas), and long enough that it can't
// turn up by chance. Without that file this check is skipped.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SELF = 'scripts/check-secrets.mjs';
const ALLOW = 'secret-check: allow';
const BLOCKED_TERMS = 'samples/blocked-terms.txt';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gitBuffer = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });

const RULES = [
  {
    name: 'private key',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  { name: 'service account key', re: /"type"\s*:\s*"service_account"|"private_key"\s*:\s*"/ },
  { name: 'Google OAuth refresh token (e.g. firebase login:ci)', re: /\b1\/\/0[A-Za-z0-9_-]{30,}/ },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { name: 'npm access token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'npm auth token (.npmrc)', re: /_authToken\s*=\s*(?!\$\{)[^\s'"]{8,}/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: 'AWS secret access key',
    re: /\baws_secret_access_key\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/i,
  },
  { name: 'Amazon MWS token', re: /\bamzn\.mws\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/ },
  { name: 'Login with Amazon client secret', re: /\bamzn1\.oa2-cs\.v1\.[0-9a-f]{32,}/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Stripe secret key', re: /\b[sr]k_live_[A-Za-z0-9]{20,}/ },
  {
    name: 'password or secret assignment',
    re: /\b(?:password|passwd|secret|client_secret)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
];

const SECRET_FILES = [
  { name: 'service account file', re: /(?:service[-_]?account|firebase-adminsdk)[^/]*\.json$/i },
  { name: 'environment file', re: /(?:^|\/)\.env(?:\.[^/]*)?$/ },
  { name: 'key file', re: /\.(?:pem|key|p12|pfx)$/i },
  { name: 'local secrets file', re: /(?:^|\/)\.secret\.local$/ },
  { name: 'runtime config file', re: /(?:^|\/)\.runtimeconfig\.json$/ },
  { name: 'credentials file', re: /(?:^|\/)\.?credentials\.json$/ },
  { name: 'office file (real data stays in samples/)', re: /\.(?:xlsx?|xlsm|docx?|pptx?)$/i },
  { name: 'file from samples/ (real data)', re: /^samples\// },
];

function install() {
  try {
    git('config', 'core.hooksPath', '.githooks');
    console.log('Git hooks enabled (.githooks): commits are checked for secrets.');
  } catch {
    // Not a git checkout (e.g. a CI build from a tarball): nothing to install.
  }
}

/** The blocked terms with their line numbers, lower-cased. No file, no terms. */
function blockedTerms() {
  let text;
  try {
    text = readFileSync(new URL(`../${BLOCKED_TERMS}`, import.meta.url), 'utf8');
  } catch {
    return [];
  }
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .flatMap((line, i) => {
      const term = line.trim();
      return term && !term.startsWith('#') ? [{ line: i + 1, text: term.toLowerCase() }] : [];
    });
}

/** Files to check, read from the index (what will actually be committed). */
function files(all) {
  const out = all
    ? git('ls-files', '-z')
    : git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z');
  return out.split('\0').filter(Boolean);
}

function check(all) {
  const problems = [];
  const terms = blockedTerms();

  if (!all) {
    // The author and committer emails that this commit will carry (respects env overrides). GitHub shows both,
    // and the committer one can differ (GIT_COMMITTER_EMAIL, or a rebase or cherry-pick by someone else).
    for (const [role, variable] of [
      ['author', 'GIT_AUTHOR_IDENT'],
      ['committer', 'GIT_COMMITTER_IDENT'],
    ]) {
      const ident = git('var', variable);
      const email = (ident.match(/<([^>]*)>/) ?? [])[1] ?? '';
      if (!/@users\.noreply\.github\.com$/i.test(email)) {
        problems.push(
          `Commit ${role} email is "${email}", not a GitHub noreply address.\n` +
            '  Set it with: git config user.email "<id>+<username>@users.noreply.github.com"',
        );
      }
    }
  }

  for (const file of files(all)) {
    if (file === SELF) continue;
    for (const rule of SECRET_FILES) {
      if (rule.re.test(file)) problems.push(`${file}: looks like a ${rule.name}`);
    }
    // The report leaves the path out, because it holds the term.
    const lowerName = file.toLowerCase();
    for (const term of terms) {
      if (lowerName.includes(term.text)) {
        problems.push(`A file's name holds a blocked term (line ${term.line} of ${BLOCKED_TERMS})`);
      }
    }
    const content = gitBuffer('show', `:${file}`);
    if (content.includes(0)) continue; // binary
    const lines = content.toString('utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!line.includes(ALLOW)) {
        for (const rule of RULES) {
          if (rule.re.test(line)) problems.push(`${file}:${i + 1}: possible ${rule.name}`);
        }
      }
      const lower = line.toLowerCase();
      for (const term of terms) {
        if (lower.includes(term.text)) {
          problems.push(
            `${file}:${i + 1}: holds a blocked term (line ${term.line} of ${BLOCKED_TERMS})`,
          );
        }
      }
    });
  }

  if (problems.length) {
    console.error('\nSecret check failed. Nothing was committed.\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      `\nRemove the secret (and unstage it), or if it's a false positive add a "${ALLOW}" comment on that line.\n`,
    );
    process.exit(1);
  }
  if (all) console.log('Secret check passed: no secrets found in tracked files.');
}

const args = process.argv.slice(2);
if (args.includes('--install')) install();
else check(args.includes('--all'));
