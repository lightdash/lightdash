import type Docker from 'dockerode';
import type { Container } from 'dockerode';
import { randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import { Writable } from 'node:stream';
import { SandboxCommandError, SandboxTimeoutError } from './errors';
import {
    type CommandResult,
    type GitAddTarget,
    type GitCloneOptions,
    type GitCommitOptions,
    type GitPushOptions,
    type GitStatus,
    type RunOptions,
    type SandboxCapabilities,
    type SandboxGit,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
} from './types';

const SANDBOX_LABEL = 'com.lightdash.sandbox';

/** Prefix for container names so they read like the other dev services
 * (`headless-browser`, `mailpit`, `minio`) instead of Docker's random
 * `adjective_surname`. A short random suffix keeps each name unique. */
const SANDBOX_NAME_PREFIX = 'lightdash-sandbox';

/** Single-quote a path for safe interpolation into a `/bin/sh -c` string. */
const shQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Build a `git -c http.extraHeader=...` prefix carrying HTTPS basic-auth
 * credentials. Passed per-invocation (never written to the repo's `.git/config`),
 * so it matches E2B's non-storing default — the cloned remote URL stays clean.
 * The same pattern GitHub Actions uses for token-authenticated checkouts.
 */
const gitAuthPrefix = (username: string, password: string): string => {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return `git -c ${shQuote(`http.extraHeader=AUTHORIZATION: basic ${token}`)}`;
};

const toEnvList = (
    envs: Record<string, string> | undefined,
): string[] | undefined =>
    envs ? Object.entries(envs).map(([k, v]) => `${k}=${v}`) : undefined;

type CollectResult = { stdout: Buffer; stderr: Buffer; exitCode: number };

class DockerSandboxHandle implements SandboxHandle {
    constructor(
        private readonly container: Container,
        readonly sandboxId: string,
        private readonly logger: SandboxLogger,
    ) {}

    // Docker has no native pause/resume snapshot — leaving the container
    // running is the resumable state (see DESIGN.md §5.5). No-op by design.
    async pause(): Promise<void> {
        this.logger.debug(
            `Docker sandbox ${this.sandboxId}: pause is a no-op (container left running)`,
        );
    }

    /**
     * Run an exec to completion, returning raw stdout/stderr buffers and the
     * exit code. Streams demuxed chunks to the optional callbacks as they
     * arrive. `stdin`, when provided, is written then closed (EOF) so the
     * command sees end-of-input.
     */
    private async execCollect(
        cmd: string[],
        opts: {
            cwd?: string;
            envs?: Record<string, string>;
            timeoutMs?: number;
            stdin?: Buffer;
            onStdout?: (chunk: Buffer) => void;
            onStderr?: (chunk: Buffer) => void;
        },
    ): Promise<CollectResult> {
        const exec = await this.container.exec({
            Cmd: cmd,
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: opts.stdin !== undefined,
            Tty: false,
            Env: toEnvList(opts.envs),
            WorkingDir: opts.cwd,
        });

        const stream = await exec.start({
            hijack: true,
            stdin: opts.stdin !== undefined,
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const stdoutSink = new Writable({
            write: (chunk: Buffer, _enc, cb) => {
                stdoutChunks.push(chunk);
                opts.onStdout?.(chunk);
                cb();
            },
        });
        const stderrSink = new Writable({
            write: (chunk: Buffer, _enc, cb) => {
                stderrChunks.push(chunk);
                opts.onStderr?.(chunk);
                cb();
            },
        });
        this.container.modem.demuxStream(stream, stdoutSink, stderrSink);

        if (opts.stdin !== undefined) {
            stream.end(opts.stdin);
        }

        const completion = new Promise<void>((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        if (opts.timeoutMs && opts.timeoutMs > 0) {
            let timer: NodeJS.Timeout;
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new SandboxTimeoutError(
                                `Command timed out after ${opts.timeoutMs}ms`,
                            ),
                        ),
                    opts.timeoutMs,
                );
            });
            await Promise.race([completion, timeout]).finally(() =>
                clearTimeout(timer),
            );
        } else {
            await completion;
        }

        const info = await exec.inspect();
        return {
            stdout: Buffer.concat(stdoutChunks),
            stderr: Buffer.concat(stderrChunks),
            exitCode: info.ExitCode ?? 0,
        };
    }

    readonly commands = {
        run: async (
            command: string,
            options?: RunOptions,
        ): Promise<CommandResult> => {
            const result = await this.execCollect(['/bin/sh', '-c', command], {
                cwd: options?.cwd,
                envs: options?.envs,
                timeoutMs: options?.timeoutMs,
                onStdout: options?.onStdout
                    ? (chunk) => options.onStdout!(chunk.toString('utf8'))
                    : undefined,
                onStderr: options?.onStderr
                    ? (chunk) => options.onStderr!(chunk.toString('utf8'))
                    : undefined,
            });
            const stdout = result.stdout.toString('utf8');
            const stderr = result.stderr.toString('utf8');
            if (result.exitCode !== 0) {
                throw new SandboxCommandError(result.exitCode, stderr, stdout);
            }
            return { stdout, stderr, exitCode: result.exitCode };
        },
    };

    readonly files = {
        read: async (path: string): Promise<string> => {
            const result = await this.execCollect(['cat', path], {});
            if (result.exitCode !== 0) {
                throw new SandboxCommandError(
                    result.exitCode,
                    result.stderr.toString('utf8'),
                    '',
                );
            }
            return result.stdout.toString('utf8');
        },
        readBytes: async (path: string): Promise<Buffer> => {
            const result = await this.execCollect(['cat', path], {});
            if (result.exitCode !== 0) {
                throw new SandboxCommandError(
                    result.exitCode,
                    result.stderr.toString('utf8'),
                    '',
                );
            }
            return result.stdout;
        },
        write: async (
            path: string,
            contents: string | Uint8Array,
        ): Promise<void> => {
            const dir = posix.dirname(path);
            const buffer =
                typeof contents === 'string'
                    ? Buffer.from(contents, 'utf8')
                    : Buffer.from(contents);
            // Create the parent dir and stream the bytes into the file via
            // stdin — handles binary content and arbitrarily large files
            // without command-line length limits.
            const result = await this.execCollect(
                [
                    '/bin/sh',
                    '-c',
                    `mkdir -p ${shQuote(dir)} && cat > ${shQuote(path)}`,
                ],
                { stdin: buffer },
            );
            if (result.exitCode !== 0) {
                throw new SandboxCommandError(
                    result.exitCode,
                    result.stderr.toString('utf8'),
                    result.stdout.toString('utf8'),
                );
            }
        },
        remove: async (path: string): Promise<void> => {
            await this.execCollect(['rm', '-f', path], {});
        },
    };

    // Git over `commands.run` with the system git binary. `commands.run` throws
    // SandboxCommandError on a non-zero exit, so each operation fails loudly the
    // way the E2B helper does. Credentials are supplied per-invocation via an
    // auth header and never persisted to the repo (see `gitAuthPrefix`).
    readonly git: SandboxGit = {
        clone: async (url: string, options: GitCloneOptions): Promise<void> => {
            const flags = [
                options.depth !== undefined ? `--depth ${options.depth}` : '',
                options.branch !== undefined
                    ? `--branch ${shQuote(options.branch)}`
                    : '',
            ]
                .filter(Boolean)
                .join(' ');
            await this.commands.run(
                `${gitAuthPrefix(options.username, options.password)} clone ${flags} ${shQuote(url)} ${shQuote(options.path)}`,
                options.timeoutMs !== undefined
                    ? { timeoutMs: options.timeoutMs }
                    : undefined,
            );
        },
        status: async (path: string): Promise<GitStatus> => {
            const branch = (
                await this.commands.run(
                    `git -C ${shQuote(path)} rev-parse --abbrev-ref HEAD`,
                )
            ).stdout.trim();
            const porcelain = (
                await this.commands.run(
                    `git -C ${shQuote(path)} status --porcelain`,
                )
            ).stdout;
            return {
                // `rev-parse --abbrev-ref HEAD` prints `HEAD` on a detached head.
                currentBranch: branch && branch !== 'HEAD' ? branch : null,
                hasChanges: porcelain.trim().length > 0,
            };
        },
        createBranch: async (path: string, branch: string): Promise<void> => {
            await this.commands.run(
                `git -C ${shQuote(path)} checkout -b ${shQuote(branch)}`,
            );
        },
        add: async (path: string, target: GitAddTarget): Promise<void> => {
            const spec =
                'all' in target
                    ? '-A'
                    : `-- ${target.files.map(shQuote).join(' ')}`;
            await this.commands.run(`git -C ${shQuote(path)} add ${spec}`);
        },
        commit: async (
            path: string,
            message: string,
            options: GitCommitOptions,
        ): Promise<void> => {
            // Pass the message through a temp file (-F) so arbitrary content —
            // newlines, quotes, co-author trailers — survives without shell
            // quoting. user.* is set per-invocation so author == committer,
            // matching the E2B helper's commit identity.
            const msgPath = `/tmp/.ld-commit-msg-${randomBytes(4).toString('hex')}`;
            await this.files.write(msgPath, message);
            try {
                await this.commands.run(
                    `git -C ${shQuote(path)} ` +
                        `-c user.name=${shQuote(options.authorName)} ` +
                        `-c user.email=${shQuote(options.authorEmail)} ` +
                        `commit -F ${shQuote(msgPath)}`,
                );
            } finally {
                await this.files.remove(msgPath);
            }
        },
        push: async (path: string, options: GitPushOptions): Promise<void> => {
            const upstream = options.setUpstream ? '-u ' : '';
            await this.commands.run(
                `${gitAuthPrefix(options.username, options.password)} -C ${shQuote(path)} ` +
                    `push ${upstream}${shQuote(options.remote)} ${shQuote(options.branch)}`,
            );
        },
    };
}

/**
 * Local-dev provider backing each sandbox with a plain Docker container reached
 * over the Docker socket. The simplest backend that exercises every layer of the
 * abstraction with zero external services — `runc` isolation only, so it is
 * gated to non-production. See DESIGN.md §8.
 */
export class DockerSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = {
        isolation: 'container',
        pauseResume: false,
        egressAllowlist: false,
        warmPool: false,
        persistence: 'objectstore',
    };

    private docker: Docker | undefined;

    constructor(
        private readonly image: string,
        private readonly logger: SandboxLogger,
    ) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'DockerSandboxProvider is not allowed in production (runc + Docker socket is root-equivalent on the host)',
            );
        }
    }

    private async getDocker(): Promise<Docker> {
        if (this.docker) {
            return this.docker;
        }
        const { default: DockerCtor } = await import('dockerode');
        const docker = new DockerCtor();
        this.docker = docker;
        return docker;
    }

    async create(spec: SandboxSpec): Promise<SandboxHandle> {
        const docker = await this.getDocker();
        const container = await docker.createContainer({
            Image: this.image,
            name: `${SANDBOX_NAME_PREFIX}-${randomBytes(4).toString('hex')}`,
            // Keep the container alive so we can exec into it across stages.
            Cmd: ['sleep', 'infinity'],
            Tty: false,
            Labels: { [SANDBOX_LABEL]: 'data-app' },
            Env: toEnvList(spec.envs),
        });
        await container.start();
        this.logger.info(
            `Docker sandbox created (id=${container.id}, image=${this.image})`,
        );
        return new DockerSandboxHandle(container, container.id, this.logger);
    }

    async connect(sandboxId: string): Promise<SandboxHandle> {
        const docker = await this.getDocker();
        const container = docker.getContainer(sandboxId);
        // Throws if the container no longer exists — callers fall back to create.
        await container.inspect();
        return new DockerSandboxHandle(container, sandboxId, this.logger);
    }

    async destroy(sandboxId: string): Promise<void> {
        try {
            const docker = await this.getDocker();
            await docker.getContainer(sandboxId).remove({ force: true });
            this.logger.info(`Docker sandbox destroyed (id=${sandboxId})`);
        } catch (error) {
            // 404 — already gone. Anything else is logged but not fatal to the
            // caller's cleanup path.
            const { statusCode } = error as { statusCode?: number };
            if (statusCode !== 404) {
                this.logger.warn(
                    `Docker sandbox destroy failed (id=${sandboxId}): ${String(
                        error,
                    )}`,
                );
            }
        }
    }

    // No native pause: the running container is itself the resumable state.
    async pause(sandboxId: string): Promise<void> {
        this.logger.debug(
            `Docker sandbox ${sandboxId}: provider pause is a no-op`,
        );
    }
}
