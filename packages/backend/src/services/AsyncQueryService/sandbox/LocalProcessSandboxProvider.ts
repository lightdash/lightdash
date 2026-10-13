import { spawn } from 'node:child_process';
import {
    mkdir,
    mkdtemp,
    open,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    SandboxCommandError,
    SandboxOutputLimitError,
    SandboxTimeoutError,
} from '../../../ee/services/SandboxRuntime/errors';
import { createGitOverCommands } from '../../../ee/services/SandboxRuntime/gitOverCommands';
import {
    type CommandResult,
    type FileReadOptions,
    type RunOptions,
    type SandboxCapabilities,
    type SandboxCommands,
    type SandboxFiles,
    type SandboxHandle,
    type SandboxProvider,
    type SnapshotRef,
} from '../../../ee/services/SandboxRuntime/types';

const SANDBOX_WORK_DIR = '/work';
const SANDBOX_DIR_PREFIX = 'lightdash-sandbox-';
const BACKEND_NODE_MODULES = path.resolve(
    __dirname,
    '../../../../node_modules',
);
const WORK_DIR_IN_COMMAND = /(^|[^\w./-])\/work(?=$|[/\s'";:)&|<>])/g;

const toHostPath = (workDir: string, sandboxPath: string): string => {
    if (
        sandboxPath !== SANDBOX_WORK_DIR &&
        !sandboxPath.startsWith(`${SANDBOX_WORK_DIR}/`)
    ) {
        throw new Error(
            `Local process sandbox only exposes ${SANDBOX_WORK_DIR}, got ${sandboxPath}`,
        );
    }
    return path.join(workDir, sandboxPath.slice(SANDBOX_WORK_DIR.length));
};

const isMissingFile = (error: unknown): boolean =>
    error instanceof Error && 'code' in error && error.code === 'ENOENT';

const runCommand = (
    workDir: string,
    command: string,
    options: RunOptions = {},
): Promise<CommandResult> =>
    new Promise((resolve, reject) => {
        const child = spawn(
            'sh',
            ['-c', command.replace(WORK_DIR_IN_COMMAND, `$1${workDir}`)],
            {
                cwd: options.cwd ? toHostPath(workDir, options.cwd) : workDir,
                env: {
                    ...process.env,
                    ...options.envs,
                    NODE_PATH: BACKEND_NODE_MODULES,
                },
                // Own process group so a timeout kills the whole command tree.
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let outputBytes = 0;
        const outcome: { failure: Error | null } = { failure: null };
        const kill = (error: Error) => {
            outcome.failure ??= error;
            try {
                process.kill(-child.pid!, 'SIGKILL');
            } catch {
                // Already exited.
            }
        };
        const timer =
            options.timeoutMs === undefined
                ? null
                : setTimeout(
                      () => kill(new SandboxTimeoutError()),
                      options.timeoutMs,
                  );
        const collect =
            (chunks: Buffer[], callback?: (chunk: string) => void) =>
            (chunk: Buffer) => {
                if (outcome.failure) return;
                outputBytes += chunk.byteLength;
                if (
                    options.maxOutputBytes !== undefined &&
                    outputBytes > options.maxOutputBytes
                ) {
                    kill(new SandboxOutputLimitError(options.maxOutputBytes));
                    return;
                }
                chunks.push(chunk);
                callback?.(chunk.toString('utf8'));
            };
        child.stdout.on('data', collect(stdout, options.onStdout));
        child.stderr.on('data', collect(stderr, options.onStderr));
        child.on('error', (error) => kill(error));
        child.on('close', (code, signal) => {
            if (timer) clearTimeout(timer);
            if (outcome.failure) {
                reject(outcome.failure);
                return;
            }
            const result = {
                stdout: Buffer.concat(stdout).toString('utf8'),
                stderr: Buffer.concat(stderr).toString('utf8'),
                exitCode: code ?? (signal ? 128 : 1),
            };
            if (result.exitCode !== 0) {
                reject(
                    new SandboxCommandError(
                        result.exitCode,
                        result.stderr,
                        result.stdout,
                    ),
                );
                return;
            }
            resolve(result);
        });
    });

const readHostFile = async (
    hostPath: string,
    options?: FileReadOptions,
): Promise<Buffer> => {
    try {
        if (options === undefined) return await readFile(hostPath);
        const file = await open(hostPath, 'r');
        try {
            const { size } = await file.stat();
            if (size > options.maxBytes) {
                throw new SandboxOutputLimitError(options.maxBytes);
            }
            return await file.readFile();
        } finally {
            await file.close();
        }
    } catch (error) {
        if (isMissingFile(error)) {
            throw new SandboxCommandError(
                1,
                `cat: ${hostPath}: No such file or directory`,
                '',
            );
        }
        throw error;
    }
};

const createHandle = (workDir: string): SandboxHandle => {
    const commands: SandboxCommands = {
        run: (command, options) => runCommand(workDir, command, options),
    };
    const files: SandboxFiles = {
        read: async (sandboxPath, options) =>
            (
                await readHostFile(toHostPath(workDir, sandboxPath), options)
            ).toString('utf8'),
        readBytes: (sandboxPath, options) =>
            readHostFile(toHostPath(workDir, sandboxPath), options),
        write: async (sandboxPath, contents) => {
            const hostPath = toHostPath(workDir, sandboxPath);
            await mkdir(path.dirname(hostPath), { recursive: true });
            await writeFile(hostPath, contents);
        },
        remove: (sandboxPath) =>
            rm(toHostPath(workDir, sandboxPath), { force: true }),
    };
    return {
        sandboxId: workDir,
        commands,
        files,
        git: createGitOverCommands(commands, files),
    };
};

/**
 * Test double for {@link SandboxProvider}: each sandbox is a host temp
 * directory standing in for `/work`, and commands run as local processes with
 * `NODE_PATH` pointing at the backend's node_modules. No isolation; tests only.
 * The sandbox id is the temp directory's absolute path.
 */
export class LocalProcessSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = { pauseResume: false };

    async create(): Promise<SandboxHandle> {
        const workDir = await mkdtemp(path.join(tmpdir(), SANDBOX_DIR_PREFIX));
        return createHandle(workDir);
    }

    // eslint-disable-next-line class-methods-use-this
    async connect(): Promise<SandboxHandle> {
        throw new Error('LocalProcessSandboxProvider does not support connect');
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy(sandboxId: string): Promise<void> {
        if (!path.basename(sandboxId).startsWith(SANDBOX_DIR_PREFIX)) {
            throw new Error(`Not a local process sandbox: ${sandboxId}`);
        }
        await rm(sandboxId, { recursive: true, force: true });
    }

    // eslint-disable-next-line class-methods-use-this
    async persist(): Promise<SnapshotRef> {
        throw new Error('LocalProcessSandboxProvider does not support persist');
    }

    // eslint-disable-next-line class-methods-use-this
    async resume(): Promise<SandboxHandle> {
        throw new Error('LocalProcessSandboxProvider does not support resume');
    }

    // eslint-disable-next-line class-methods-use-this
    async deleteSnapshot(): Promise<void> {
        throw new Error(
            'LocalProcessSandboxProvider does not support deleteSnapshot',
        );
    }
}
