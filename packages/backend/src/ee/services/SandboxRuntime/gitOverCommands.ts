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
 * Build a `git -c http.extraHeader=...` prefix carrying HTTPS basic-auth
 * credentials. Passed per-invocation (never written to the repo's `.git/config`),
 * so the cloned remote URL stays clean.
 * The same pattern GitHub Actions uses for token-authenticated checkouts.
 */
const gitAuthPrefix = (username: string, password: string): string => {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return `git -c ${shQuote(`http.extraHeader=AUTHORIZATION: basic ${token}`)}`;
};

/**
 * Implement {@link SandboxGit} on top of a sandbox's `commands`/`files` data
 * plane, using the system `git` binary inside the sandbox. Providers without a
 * native git SDK (Docker, Lambda MicroVMs) share this — `commands.run` throws
 * `SandboxCommandError` on a non-zero exit, so each operation fails loudly.
 * Credentials are supplied per-invocation via an
 * auth header and never persisted to the repo (see {@link gitAuthPrefix}).
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
            `${gitAuthPrefix(options.username, options.password)} clone ${flags} ${shQuote(url)} ${shQuote(options.path)}`,
            options.timeoutMs !== undefined
                ? { timeoutMs: options.timeoutMs }
                : undefined,
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
            `${gitAuthPrefix(options.username, options.password)} -C ${shQuote(path)} ` +
                `push ${upstream}${shQuote(options.remote)} ${shQuote(options.branch)}`,
        );
    },
});
