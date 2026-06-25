/**
 * Vendor-neutral sandbox errors. Providers catch their backend's error types and
 * rethrow one of these, so feature code never branches on a vendor type (e.g.
 * E2B's `CommandExitError`).
 */

/** Thrown when a sandbox command exits with a non-zero status. */
export class SandboxCommandError extends Error {
    constructor(
        readonly exitCode: number,
        readonly stderr: string,
        readonly stdout: string,
    ) {
        super(`Sandbox command failed with exit code ${exitCode}`);
        this.name = 'SandboxCommandError';
    }
}

/** Thrown when a sandbox command exceeds its timeout. */
export class SandboxTimeoutError extends Error {
    constructor(message = 'Sandbox command timed out') {
        super(message);
        this.name = 'SandboxTimeoutError';
    }
}
