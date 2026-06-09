/**
 * Read-only shell over a dbt repo, built on `just-bash` (Vercel Labs' TypeScript
 * bash reimplementation) instead of a hand-rolled parser. just-bash owns all the
 * tokenising, quoting, piping, `&&`/`||`, redirection and flag handling — and
 * routes every regex through RE2 (linear-time, ReDoS-safe). We supply two things:
 *
 *  1. {@link RepoFileSystem} — an `IFileSystem` over our GitHub-backed
 *     {@link RepoFs} (tree index + lazy fetch + cache). Every write throws.
 *  2. The configuration that makes the environment read-only and bounded — a
 *     command allowlist (no `rm`/`mv`/`cp`/`tee`…), network/python/javascript all
 *     left OFF, plus output/time/iteration limits.
 *
 * The agent is trained on real bash, so exposing the genuine command surface
 * (`sed`, `awk`, `cut`, `uniq`, `tail`, `rg`, real `grep -E`, `||`, globs) removes
 * the dead-end turns the old hand-rolled subset produced on every unsupported
 * construct.
 */
import { Bash, type CommandName } from 'just-bash';
import { RepoFileSystem } from './repoFileSystem';
import type { RepoFs } from './RepoFs';

/**
 * An expected, agent-recoverable shell failure (unknown command, bad flag,
 * missing file). The tool wrapper surfaces the message to the model but does not
 * page Sentry — mirrors the previous hand-rolled shell's contract.
 */
export class ShellError extends Error {}

/**
 * The read-only command allowlist. Anything that mutates the filesystem
 * (`mkdir`/`rm`/`cp`/`mv`/`ln`/`touch`/`chmod`/`tee`/`split`), spawns scripts
 * (`bash`/`sh`), or is otherwise irrelevant to read-only code exploration is
 * simply never registered. Network (`curl`), `python3` and `js-exec` are off by
 * default in just-bash and we never enable them.
 */
export const READ_ONLY_COMMANDS: CommandName[] = [
    // listing / reading
    'ls',
    'cat',
    'head',
    'tail',
    'tree',
    'find',
    'stat',
    'du',
    'file',
    'wc',
    'readlink',
    'pwd',
    // search
    'grep',
    'egrep',
    'fgrep',
    'rg',
    // text processing
    'sed',
    'awk',
    'sort',
    'uniq',
    'comm',
    'cut',
    'paste',
    'join',
    'tr',
    'rev',
    'nl',
    'fold',
    'expand',
    'unexpand',
    'column',
    'strings',
    'od',
    'tac',
    'jq',
    'diff',
    'base64',
    // path helpers / misc read-only utilities
    'basename',
    'dirname',
    'xargs',
    'echo',
    'printf',
    'seq',
    'expr',
    'date',
    'env',
    'printenv',
    'which',
    'md5sum',
    'sha1sum',
    'sha256sum',
    'true',
    'false',
];

// Agent-facing output cap. just-bash's own maxOutputSize is set far higher so it
// never truncates mid-pipeline (e.g. `grep huge | head`); we clamp the final
// result here, reusing the old shell's "narrow your command" guidance.
const MAX_OUTPUT_CHARS = 60_000;
const MAX_INTERNAL_OUTPUT = 8 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 15_000;

const clamp = (text: string): string => {
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… output truncated (${
        text.length - MAX_OUTPUT_CHARS
    } more characters). Narrow your command (e.g. pipe to \`head\` or grep a subpath).`;
};

// Reuse one RepoFileSystem (and its path snapshot) per RepoFs across the calls in
// a run; the underlying file-content cache already lives in RepoFs.
const adapters = new WeakMap<RepoFs, Promise<RepoFileSystem>>();
const getAdapter = (repoFs: RepoFs): Promise<RepoFileSystem> => {
    let adapter = adapters.get(repoFs);
    if (!adapter) {
        adapter = RepoFileSystem.create(repoFs);
        adapters.set(repoFs, adapter);
    }
    return adapter;
};

const leadingCommand = (command: string): string =>
    command.trim().split(/\s+/)[0] ?? '';

/**
 * Execute one read-only shell command line against the repo and return combined
 * output. Throws {@link ShellError} for an expected failure (the caller surfaces
 * it to the agent without Sentry); lets anything unexpected propagate so it is
 * captured as a real fault.
 */
export const runRepoShellCommand = async (
    repoFs: RepoFs,
    command: string,
): Promise<string> => {
    const fs = await getAdapter(repoFs);
    const bash = new Bash({
        fs,
        cwd: '/',
        commands: READ_ONLY_COMMANDS,
        executionLimits: { maxOutputSize: MAX_INTERNAL_OUTPUT },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
    let result;
    try {
        result = await bash.exec(command, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }

    const stdout = (result.stdout ?? '').replace(/\n$/, '');
    const stderr = (result.stderr ?? '').trim();

    // Real output wins regardless of exit code — a `grep` with matches exits 0,
    // a `grep` with none exits 1 with empty output (not an error).
    if (stdout.length > 0) {
        const note =
            ['find', 'grep', 'rg', 'ls'].includes(leadingCommand(command)) &&
            (await repoFs.isTruncated())
                ? '\n… note: this repository is large and GitHub truncated its file listing, so find/grep/ls results may be incomplete — narrow to a subdirectory.'
                : '';
        return clamp(stdout + note);
    }

    // No stdout: a non-zero exit with a diagnostic is an expected agent mistake
    // (unknown command, bad flag, missing file) — surface it, don't page Sentry.
    if (result.exitCode !== 0 && stderr.length > 0) {
        throw new ShellError(stderr);
    }
    // Exit 0 with only stderr (a warning) → still useful to the agent.
    if (stderr.length > 0) return clamp(stderr);
    return '(no output)';
};
