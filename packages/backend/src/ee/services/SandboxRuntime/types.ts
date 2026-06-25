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

/** Parsed working-tree state, narrowed to what feature code reads. */
export interface GitStatus {
    /** Current branch name, or null when detached / unavailable. */
    currentBranch: string | null;
    /** Whether the working tree has any tracked or untracked changes. */
    hasChanges: boolean;
}

/** Options for an authenticated HTTPS clone. */
export interface GitCloneOptions {
    /** Destination path for the clone. */
    path: string;
    /** Username for HTTPS basic auth (e.g. `x-access-token`, `oauth2`). */
    username: string;
    /** Password / token for HTTPS basic auth. */
    password: string;
    /** Shallow-clone depth; omit for a full clone. */
    depth?: number;
    /** Per-operation timeout; omit for the provider default. */
    timeoutMs?: number;
    /** Branch to check out instead of the remote default. */
    branch?: string;
}

/**
 * What to stage. A discriminated choice rather than two optional flags: stage a
 * specific set of paths, or stage everything — never both, never neither.
 */
export type GitAddTarget = { files: string[] } | { all: true };

/** Author identity stamped on a commit (also used as the committer). */
export interface GitCommitOptions {
    authorName: string;
    authorEmail: string;
}

/** Options for an authenticated HTTPS push. */
export interface GitPushOptions {
    remote: string;
    branch: string;
    /** Username for HTTPS basic auth. */
    username: string;
    /** Password / token for HTTPS basic auth. */
    password: string;
    /** Set upstream tracking (`-u`) when true. */
    setUpstream?: boolean;
}

/**
 * Data plane: git operations inside the sandbox. The subset of git the writeback
 * feature drives — credentials are passed per call and never persisted to the
 * repo, matching E2B's non-storing default.
 */
export interface SandboxGit {
    /** Clone a repo to {@link GitCloneOptions.path}, authenticating over HTTPS. */
    clone(url: string, options: GitCloneOptions): Promise<void>;
    /** Parse the working-tree status of the repo at `path`. */
    status(path: string): Promise<GitStatus>;
    /** Create and check out `branch` in the repo at `path`. */
    createBranch(path: string, branch: string): Promise<void>;
    /** Stage changes in the repo at `path`. */
    add(path: string, target: GitAddTarget): Promise<void>;
    /** Commit the staged changes in the repo at `path`. */
    commit(
        path: string,
        message: string,
        options: GitCommitOptions,
    ): Promise<void>;
    /** Push a branch from the repo at `path`, authenticating over HTTPS. */
    push(path: string, options: GitPushOptions): Promise<void>;
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
    readonly git: SandboxGit;
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
