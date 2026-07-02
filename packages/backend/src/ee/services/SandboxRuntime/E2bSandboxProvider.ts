import { ALL_TRAFFIC, CommandExitError, Sandbox, TimeoutError } from 'e2b';
import { SandboxCommandError, SandboxTimeoutError } from './errors';
import { createGitOverCommands } from './gitOverCommands';
import {
    type CommandResult,
    type PersistOptions,
    type RunOptions,
    type SandboxCapabilities,
    type SandboxGit,
    type SandboxHandle,
    type SandboxProvider,
    type SandboxSpec,
    type SnapshotRef,
} from './types';

// Sandboxes re-attached via connect() get the same long-lived ceiling as the
// pipeline grants on create — long enough to cover a full multi-stage run.
const CONNECT_TIMEOUT_MS = 60 * 60 * 1000;

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

/** Rethrow E2B's command/timeout errors as vendor-neutral ones. */
const normalizeError = (error: unknown): never => {
    if (error instanceof CommandExitError) {
        throw new SandboxCommandError(
            error.exitCode,
            error.stderr,
            error.stdout,
        );
    }
    if (error instanceof TimeoutError) {
        throw new SandboxTimeoutError(error.message);
    }
    throw error;
};

class E2bSandboxHandle implements SandboxHandle {
    constructor(private readonly sandbox: Sandbox) {}

    get sandboxId(): string {
        return this.sandbox.sandboxId;
    }

    readonly commands = {
        run: async (
            command: string,
            options?: RunOptions,
        ): Promise<CommandResult> => {
            try {
                const result = await this.sandbox.commands.run(command, {
                    cwd: options?.cwd,
                    envs: options?.envs,
                    timeoutMs: options?.timeoutMs,
                    onStdout: options?.onStdout,
                    onStderr: options?.onStderr,
                });
                return {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                };
            } catch (error) {
                return normalizeError(error);
            }
        },
    };

    readonly files = {
        read: (path: string): Promise<string> => this.sandbox.files.read(path),
        readBytes: async (path: string): Promise<Buffer> => {
            const bytes = await this.sandbox.files.read(path, {
                format: 'bytes',
            });
            return Buffer.from(bytes);
        },
        write: async (
            path: string,
            contents: string | Uint8Array,
        ): Promise<void> => {
            await this.sandbox.files.write(
                path,
                typeof contents === 'string'
                    ? contents
                    : toArrayBuffer(contents),
            );
        },
        remove: async (path: string): Promise<void> => {
            await this.sandbox.files.remove(path);
        },
    };

    // Build git on top of the (error-normalizing) `commands`/`files` data plane
    // via the shared helper, so a git failure surfaces as `SandboxCommandError`
    // like every other command — rather than leaking the E2B SDK's own git
    // error types the way the previous passthrough did.
    readonly git: SandboxGit = createGitOverCommands(this.commands, this.files);
}

/**
 * E2B-backed provider — a near 1:1 passthrough to the `e2b` SDK. This is the
 * reference implementation and the managed default.
 */
export class E2bSandboxProvider implements SandboxProvider {
    readonly capabilities: SandboxCapabilities = { pauseResume: true };

    constructor(private readonly apiKey: string) {}

    async create(spec: SandboxSpec): Promise<SandboxHandle> {
        const sandbox = await Sandbox.create(spec.templateRef, {
            timeoutMs: spec.timeoutMs,
            apiKey: this.apiKey,
            lifecycle: { onTimeout: 'pause' },
            network: {
                allowOut: spec.egress.allow,
                denyOut: [ALL_TRAFFIC],
            },
            ...(spec.envs ? { envs: spec.envs } : {}),
        });
        return new E2bSandboxHandle(sandbox);
    }

    async connect(sandboxId: string): Promise<SandboxHandle> {
        const sandbox = await Sandbox.connect(sandboxId, {
            apiKey: this.apiKey,
            timeoutMs: CONNECT_TIMEOUT_MS,
        });
        return new E2bSandboxHandle(sandbox);
    }

    async destroy(sandboxId: string): Promise<void> {
        await Sandbox.kill(sandboxId, { apiKey: this.apiKey });
    }

    // Native in-memory pause IS the snapshot: the paused sandbox keeps RAM, disk
    // and live processes, so the declared workspace is irrelevant here. The ref
    // is just the sandboxId to reconnect to.
    async persist(
        handle: SandboxHandle,
        _options: PersistOptions,
    ): Promise<SnapshotRef> {
        await Sandbox.pause(handle.sandboxId, { apiKey: this.apiKey });
        return { kind: 'e2b-paused', sandboxId: handle.sandboxId };
    }

    async resume(ref: SnapshotRef, _spec: SandboxSpec): Promise<SandboxHandle> {
        if (ref.kind !== 'e2b-paused') {
            throw new Error(
                `E2bSandboxProvider cannot resume a snapshot of kind '${ref.kind}'`,
            );
        }
        return this.connect(ref.sandboxId);
    }

    // eslint-disable-next-line class-methods-use-this
    async deleteSnapshot(_ref: SnapshotRef): Promise<void> {
        // The paused sandbox IS the snapshot; destroy(sandboxId) reclaims it, so
        // there is no separate blob to delete here.
    }
}
