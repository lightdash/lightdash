/**
 * Provider-neutral sandbox runtime interfaces. Application code (AppGenerateService,
 * AiWritebackService) depends on these instead of the concrete `e2b` SDK, so the
 * same feature code runs on any backend (E2B, local Docker, …). See DESIGN.md.
 */

/** A minimal logger surface (structurally compatible with winston's Logger). */
export interface SandboxLogger {
    info(message: string): void;
    warn(message: string): void;
    debug(message: string): void;
    error(message: string): void;
}

export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export interface RunOptions {
    cwd?: string;
    envs?: Record<string, string>;
    timeoutMs?: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
}

/** Data plane: run a command inside the sandbox. */
export interface SandboxCommands {
    /**
     * Run a shell command. Resolves with the command result on a zero exit and
     * throws {@link SandboxCommandError} on any non-zero exit (matching E2B's
     * no-opt-out behavior), or {@link SandboxTimeoutError} on timeout.
     */
    run(command: string, options?: RunOptions): Promise<CommandResult>;
}

/** Data plane: read/write files inside the sandbox. */
export interface SandboxFiles {
    /** Read a UTF-8 text file. */
    read(path: string): Promise<string>;
    /** Read a binary file as raw bytes. */
    readBytes(path: string): Promise<Buffer>;
    /** Write a text or binary file, creating parent directories as needed. */
    write(path: string, contents: string | Uint8Array): Promise<void>;
    /** Remove a file (no error if it does not exist). */
    remove(path: string): Promise<void>;
}

/**
 * Execution / data plane handle for a single running sandbox. Satisfied by the
 * provider's native client (E2B) or by `docker exec` (local Docker).
 */
export interface SandboxHandle {
    readonly sandboxId: string;
    /**
     * Persist + suspend the sandbox so it can be resumed later. Capability-gated:
     * providers without a native pause (Docker) treat this as a no-op.
     */
    pause(): Promise<void>;
    readonly commands: SandboxCommands;
    readonly files: SandboxFiles;
}

export type SandboxIsolation = 'microvm' | 'gvisor' | 'container';
export type SandboxPersistence = 'memory' | 'volume' | 'objectstore';

export interface SandboxCapabilities {
    isolation: SandboxIsolation;
    /** true only where a native memory snapshot exists (E2B). */
    pauseResume: boolean;
    /** can it actually enforce SandboxSpec.egress? */
    egressAllowlist: boolean;
    warmPool: boolean;
    persistence: SandboxPersistence;
}

export interface SandboxSpec {
    /** OCI image / E2B template ref — interpreted by the chosen provider. */
    templateRef: string;
    timeoutMs: number;
    /** Outbound host allowlist. `denyOut: ALL_TRAFFIC` is implicit. */
    egress: { allow: string[] };
    envs?: Record<string, string>;
}

/**
 * Control plane: spawn / re-attach / destroy / pause a sandbox. Irreducibly
 * environment-specific (Docker API, E2B API, k8s, …).
 */
export interface SandboxProvider {
    readonly capabilities: SandboxCapabilities;
    create(spec: SandboxSpec): Promise<SandboxHandle>;
    /** Re-attach to an existing sandbox by id. */
    connect(sandboxId: string): Promise<SandboxHandle>;
    /** Permanently destroy a sandbox. No error if it is already gone. */
    destroy(sandboxId: string): Promise<void>;
    /** Pause a sandbox by id (capability-gated; no-op where unsupported). */
    pause(sandboxId: string): Promise<void>;
}
