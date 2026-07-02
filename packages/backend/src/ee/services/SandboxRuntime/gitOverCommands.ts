import { randomBytes } from 'node:crypto';
import {
    type GitAddTarget,
    type GitCloneOptions,
    type GitCommitOptions,
    type GitPushOptions,
    type GitStatus,
    type SandboxCommands,
    type SandboxFiles,
    type SandboxGit,
} from './types';

/** Single-quote a value for safe interpolation into a `/bin/sh -c` string. */
export const shQuote = (value: string): string =>
    `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Build the per-invocation env that carries HTTPS basic-auth credentials to git
 * as an `http.extraHeader` config entry, injected via `GIT_CONFIG_COUNT`/`_KEY`/
 * `_VALUE` (git 2.31+) rather than `-c` on the command line. This keeps the
 * short-lived token out of argv — where it would otherwise be world-readable via
 * `/proc/<pid>/cmdline` to any process in the sandbox for the life of the git
 * command — and off disk (never written to the repo's `.git/config`). The env is
 * scoped to the single clone/push exec the host drives, so the untrusted in-
 * sandbox agent's own processes never inherit it. A fresh token is passed on
 * each invocation; nothing here caches or reuses it across turns.
 */
const gitAuthEnv = (
    username: string,
    password: string,
): Record<string, string> => {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraHeader',
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${token}`,
    };
};

/**
 * Implement {@link SandboxGit} on top of a sandbox's `commands`/`files` data
 * plane, using the system `git` binary inside the sandbox. Every provider shares
 * this — including E2B, which routes through it rather than its vendor git SDK so
 * failures surface as `SandboxCommandError` (thrown by `commands.run` on a non-
 * zero exit) instead of leaking a vendor error type. Credentials are supplied
 * per-invocation via the process env and never persisted to the repo or placed
 * on argv (see {@link gitAuthEnv}).
 */
export const createGitOverCommands = (
    commands: SandboxCommands,
    files: SandboxFiles,
): SandboxGit => ({
    clone: async (url: string, options: GitCloneOptions): Promise<void> => {
        const flags = [
            options.depth !== undefined ? `--depth ${options.depth}` : '',
            options.branch !== undefined
                ? `--branch ${shQuote(options.branch)}`
                : '',
        ]
            .filter(Boolean)
            .join(' ');
        await commands.run(
            `git clone ${flags} ${shQuote(url)} ${shQuote(options.path)}`,
            {
                envs: gitAuthEnv(options.username, options.password),
                ...(options.timeoutMs !== undefined
                    ? { timeoutMs: options.timeoutMs }
                    : {}),
            },
        );
    },
    status: async (path: string): Promise<GitStatus> => {
        const branch = (
            await commands.run(
                `git -C ${shQuote(path)} rev-parse --abbrev-ref HEAD`,
            )
        ).stdout.trim();
        const porcelain = (
            await commands.run(`git -C ${shQuote(path)} status --porcelain`)
        ).stdout;
        return {
            // `rev-parse --abbrev-ref HEAD` prints `HEAD` on a detached head.
            currentBranch: branch && branch !== 'HEAD' ? branch : null,
            hasChanges: porcelain.trim().length > 0,
        };
    },
    createBranch: async (path: string, branch: string): Promise<void> => {
        await commands.run(
            `git -C ${shQuote(path)} checkout -b ${shQuote(branch)}`,
        );
    },
    add: async (path: string, target: GitAddTarget): Promise<void> => {
        const spec =
            'all' in target
                ? '-A'
                : `-- ${target.files.map(shQuote).join(' ')}`;
        await commands.run(`git -C ${shQuote(path)} add ${spec}`);
    },
    commit: async (
        path: string,
        message: string,
        options: GitCommitOptions,
    ): Promise<void> => {
        // Pass the message through a temp file (-F) so arbitrary content —
        // newlines, quotes, co-author trailers — survives without shell
        // quoting. user.* is set per-invocation so author == committer.
        const msgPath = `/tmp/.ld-commit-msg-${randomBytes(4).toString('hex')}`;
        await files.write(msgPath, message);
        try {
            await commands.run(
                `git -C ${shQuote(path)} ` +
                    `-c user.name=${shQuote(options.authorName)} ` +
                    `-c user.email=${shQuote(options.authorEmail)} ` +
                    `commit -F ${shQuote(msgPath)}`,
            );
        } finally {
            await files.remove(msgPath);
        }
    },
    push: async (path: string, options: GitPushOptions): Promise<void> => {
        const upstream = options.setUpstream ? '-u ' : '';
        await commands.run(
            `git -C ${shQuote(path)} ` +
                `push ${upstream}${shQuote(options.remote)} ${shQuote(options.branch)}`,
            { envs: gitAuthEnv(options.username, options.password) },
        );
    },
});
