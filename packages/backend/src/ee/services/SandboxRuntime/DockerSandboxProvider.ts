import type Docker from 'dockerode';
import type { Container } from 'dockerode';
import { randomBytes, randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { Writable } from 'node:stream';
import { SandboxCommandError, SandboxTimeoutError } from './errors';
import { createGitOverCommands, shQuote } from './gitOverCommands';
import { type SnapshotStore } from './SnapshotStore';
import {
    type CommandResult,
    type PersistOptions,
    type RunOptions,
    type SandboxCapabilities,
    type SandboxGit,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
    type SnapshotRef,
} from './types';

const SANDBOX_LABEL = 'com.lightdash.sandbox';

/** Prefix for container names so they read like the other dev services
 * (`headless-browser`, `mailpit`, `minio`) instead of Docker's random
 * `adjective_surname`. A short random suffix keeps each name unique. */
const SANDBOX_NAME_PREFIX = 'lightdash-sandbox';

/**
 * Strip the leading slash so a `tar -C / <path>` archives `home/user/repo`
 * rather than `/home/user/repo`, letting `tar -x -C /` restore it to the exact
 * same absolute location on resume.
 */
const toArchiveRelative = (absolutePath: string): string =>
    absolutePath.replace(/^\/+/, '');

const toEnvList = (
    envs: Record<string, string> | undefined,
): string[] | undefined =>
    envs ? Object.entries(envs).map(([k, v]) => `${k}=${v}`) : undefined;

type CollectResult = { stdout: Buffer; stderr: Buffer; exitCode: number };

class DockerSandboxHandle implements SandboxHandle {
    constructor(
        private readonly container: Container,
        readonly sandboxId: string,
    ) {}

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

    // Git over the system git binary, via the shared `commands`/`files` helper
    // (the same one the Lambda provider uses). Credentials are passed
    // per-invocation and never persisted to the repo.
    readonly git: SandboxGit = createGitOverCommands(this.commands, this.files);
}

/**
 * Local-dev provider backing each sandbox with a plain Docker container reached
 * over the Docker socket. The simplest backend that exercises every layer of the
 * abstraction with zero external services — `runc` isolation only, so it is
 * gated to non-production. See docs/sandbox-runtime.md.
 */
export class DockerSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = { pauseResume: false };

    private docker: Docker | undefined;

    constructor(
        private readonly image: string,
        private readonly logger: SandboxLogger,
        private readonly snapshotStore: SnapshotStore,
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
        return new DockerSandboxHandle(container, container.id);
    }

    async connect(sandboxId: string): Promise<SandboxHandle> {
        const docker = await this.getDocker();
        const container = docker.getContainer(sandboxId);
        // Throws if the container no longer exists — callers fall back to create.
        await container.inspect();
        return new DockerSandboxHandle(container, sandboxId);
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

    /**
     * Tar the declared workspace inside the container and push it to the
     * snapshot store. The archive is built `-C /` from slash-relative include
     * paths so resume restores them to the same absolute locations. The tarball
     * is staged to a file and read back as raw bytes (never piped through the
     * string-typed `commands.run` stdout, which would corrupt binary content).
     * The object-store key is generated here — the key is an opaque storage
     * detail the provider owns and returns in the ref (the Manager never sees it).
     * Does not stop the container — the caller destroys it after persisting.
     */
    async persist(
        handle: SandboxHandle,
        options: PersistOptions,
    ): Promise<SnapshotRef> {
        const { workspace } = options;
        const snapshotKey = `sandboxes/${randomUUID()}/snapshot.tar.gz`;
        const archivePath = `/tmp/.ld-snapshot-${randomBytes(4).toString(
            'hex',
        )}.tar.gz`;
        const excludeFlags = workspace.exclude
            .map((pattern) => `--exclude=${shQuote(pattern)}`)
            .join(' ');
        const includeArgs = workspace.include
            .map((path) => shQuote(toArchiveRelative(path)))
            .join(' ');
        // `--ignore-failed-read` so a declared-but-absent include path (e.g. the
        // HOME candidate for the other provider's runtime user) is skipped rather
        // than failing the whole archive — the workspace lists both `/root/.claude*`
        // and `/home/user/.claude*`, and only the live HOME's actually exist.
        await handle.commands.run(
            `tar czf ${shQuote(archivePath)} --ignore-failed-read ${excludeFlags} -C / ${includeArgs}`,
        );
        try {
            const archive = await handle.files.readBytes(archivePath);
            await this.snapshotStore.put(snapshotKey, archive);
        } finally {
            await handle.files.remove(archivePath);
        }
        this.logger.info(
            `Docker sandbox ${handle.sandboxId} persisted to ${snapshotKey} (${workspace.include.length} path(s))`,
        );
        return { kind: 's3-tar', key: snapshotKey };
    }

    /**
     * Recreate a fresh container from `spec`, then download the snapshot tarball
     * and extract it `-C /` so the workspace lands back at its original paths.
     * The new container has a new id — the caller (Manager) records it.
     */
    async resume(ref: SnapshotRef, spec: SandboxSpec): Promise<SandboxHandle> {
        if (ref.kind !== 's3-tar') {
            throw new Error(
                `DockerSandboxProvider cannot resume a snapshot of kind '${ref.kind}'`,
            );
        }
        const handle = await this.create(spec);
        const archivePath = `/tmp/.ld-restore-${randomBytes(4).toString(
            'hex',
        )}.tar.gz`;
        const archive = await this.snapshotStore.get(ref.key);
        await handle.files.write(archivePath, archive);
        try {
            await handle.commands.run(`tar xzf ${shQuote(archivePath)} -C /`);
        } finally {
            await handle.files.remove(archivePath);
        }
        this.logger.info(
            `Docker sandbox ${handle.sandboxId} resumed from ${ref.key}`,
        );
        return handle;
    }

    /**
     * Delete the snapshot blob backing an s3-tar ref. The Manager calls this on
     * destroy/GC; storage cleanup lives here next to the tar/untar that wrote it.
     */
    async deleteSnapshot(ref: SnapshotRef): Promise<void> {
        if (ref.kind !== 's3-tar') {
            return;
        }
        await this.snapshotStore.delete(ref.key);
    }
}
