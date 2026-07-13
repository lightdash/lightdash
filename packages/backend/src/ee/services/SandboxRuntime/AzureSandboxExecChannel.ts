import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { Agent, type Dispatcher } from 'undici';
import { SandboxCommandError, SandboxTimeoutError } from './errors';
import { shQuote } from './gitOverCommands';
import {
    type CommandResult,
    type RunOptions,
    type SandboxCommands,
    type SandboxFiles,
} from './types';

/**
 * Fold `cwd`/`envs` into a single `/bin/sh -c` command line. The native exec
 * takes only a command (no cwd/env fields), so a `cd …` prefix and per-var
 * `export`s make `RunOptions.cwd`/`envs` work on any exec surface.
 */
const buildCommandLine = (command: string, options?: RunOptions): string => {
    const parts: string[] = [];
    if (options?.cwd) parts.push(`cd ${shQuote(options.cwd)} &&`);
    if (options?.envs) {
        const exports = Object.entries(options.envs)
            .map(([key, value]) => `${key}=${shQuote(value)}`)
            .join(' ');
        if (exports) parts.push(`export ${exports};`);
    }
    parts.push(command);
    return parts.join(' ');
};

/**
 * Data plane for an Azure Container Apps **Sandbox**. Unlike the Dynamic Sessions
 * / Lambda backends, Sandboxes expose a *native* data plane on the regional ADC
 * endpoint (`management.azuredevcompute.io`) — command execution and file
 * management are first-class REST operations scoped to a single sandbox, so there
 * is no in-container exec agent and no forwarding proxy. `commands`/`files` call
 * the sandbox-scoped `baseUrl` (built by the control plane) with an Entra bearer
 * for the data-plane audience; `git` is layered on `commands.run` by
 * {@link createGitOverCommands}.
 *
 * The wire format below is verified against the `aca` CLI's own transport
 * (`aca sandbox exec/fs … --verbose`, PROD-8591):
 * - `POST {baseUrl}/executeShellCommand?api-version=…` JSON `{command}` →
 *   `{stdout, stderr, exitCode}`. Buffered (the native call returns the completed
 *   result), so a short run streams nothing until it finishes — `onStdout`/`onStderr`
 *   fire once with the full output. Runs bounded above
 *   {@link DETACHED_EXEC_THRESHOLD_MS} instead start detached and are polled
 *   (see {@link AzureSandboxExecChannel.runDetached}), which streams output
 *   incrementally and sidesteps the gateway's ~600s per-request cap.
 * - `GET {baseUrl}/files?path=…` → raw bytes (200) / 404 `{errorCode:"FileNotFound"}`;
 *   `PUT …&createDirs=true` octet-stream body → write; `DELETE …&recursive=true` → remove.
 */
const EXEC_PATH = '/executeShellCommand';
const FILES_PATH = '/files';

/**
 * The exec endpoint is buffered: response headers arrive only when the shell
 * command completes, so undici's default 300s headersTimeout kills any longer
 * run with `fetch failed`. This dispatcher disables undici's own clocks and is
 * used ONLY for exec calls that are already bounded by the caller's
 * AbortController — unbounded calls keep undici's defaults as a safety net.
 */
export const bufferedExecDispatcher = new Agent({
    headersTimeout: 0,
    bodyTimeout: 0,
});

/**
 * The data-plane gateway 504s any single request at ~600s regardless of client
 * settings, so a buffered exec can never outlive ~10 minutes. Runs bounded by a
 * timeout above this threshold switch to detached mode: start the command with
 * nohup (a ~1s request), then poll its output/exit files with short requests.
 * Kept well under the gateway cap so buffered calls never race it.
 */
const DETACHED_EXEC_THRESHOLD_MS = 5 * 60 * 1000;
const DETACHED_POLL_INTERVAL_MS = 2_000;
/** Poll/start/kill requests are short; bound them individually. */
const INTERNAL_EXEC_TIMEOUT_MS = 60 * 1000;
/**
 * A failed poll leaves the detached process running, so transient data-plane
 * hiccups are survivable — only this many consecutive failures abort the run.
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

interface ExecResponse {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/** One parsed detached poll tick: new output bytes + exit code when done. */
interface DetachedTick {
    exitCode: number | null;
    out: Buffer;
    err: Buffer;
}

/**
 * Parse the S/O/E wire protocol emitted by the detached poll command: an
 * `S<exit-code-or-empty>` line, then `O<base64>` / `E<base64>` lines carrying
 * the new stdout/stderr bytes since the last poll (base64 so byte offsets stay
 * exact through the JSON exec response). Throws on malformed output — the
 * caller treats that as a transient poll failure.
 */
const parseDetachedTick = (stdout: string): DetachedTick => {
    const lines = stdout.split('\n');
    const sLine = lines.find((line) => line.startsWith('S'));
    const oLine = lines.find((line) => line.startsWith('O'));
    const eLine = lines.find((line) => line.startsWith('E'));
    if (sLine === undefined || oLine === undefined || eLine === undefined) {
        throw new Error(
            `malformed detached poll output: ${stdout.slice(0, 200)}`,
        );
    }
    const status = sLine.slice(1).trim();
    let exitCode: number | null = null;
    if (status !== '') {
        exitCode = Number(status);
        if (!Number.isInteger(exitCode)) {
            throw new Error(`malformed detached exit status: "${status}"`);
        }
    }
    return {
        exitCode,
        out: Buffer.from(oLine.slice(1), 'base64'),
        err: Buffer.from(eLine.slice(1), 'base64'),
    };
};

/** Validate/narrow the native exec JSON to {@link ExecResponse}. */
const decodeExecResponse = (value: unknown): ExecResponse => {
    if (typeof value !== 'object' || value === null) {
        throw new SandboxCommandError(
            -1,
            'exec response was not an object',
            '',
        );
    }
    const record = value as Record<string, unknown>;
    if (typeof record.exitCode !== 'number') {
        throw new SandboxCommandError(
            -1,
            `exec response missing a numeric exitCode: ${JSON.stringify(
                value,
            ).slice(0, 200)}`,
            '',
        );
    }
    return {
        stdout: typeof record.stdout === 'string' ? record.stdout : '',
        stderr: typeof record.stderr === 'string' ? record.stderr : '',
        exitCode: record.exitCode,
    };
};

export class AzureSandboxExecChannel {
    private token: string | null = null;

    private readonly baseUrl: string;

    private readonly detachedThresholdMs: number;

    private readonly pollIntervalMs: number;

    /**
     * @param baseUrl the sandbox-scoped data-plane URL built by the control plane
     *   (region endpoint + sandbox resource path), e.g.
     *   `https://<region>.management.azuredevcompute.io/…/sandboxes/<id>`.
     * @param apiVersion the ADC data-plane API version (query param on every call).
     * @param mintToken mints a fresh Entra bearer for the data-plane audience.
     *   Called lazily on first use and again to refresh after an auth rejection,
     *   so a turn that outlives its token self-heals.
     * @param tuning detached-exec knobs, overridable for tests.
     */
    constructor(
        baseUrl: string,
        private readonly apiVersion: string,
        private readonly mintToken: () => Promise<string>,
        tuning?: { detachedThresholdMs?: number; pollIntervalMs?: number },
    ) {
        // Trailing slash stripped so path concatenation is predictable.
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.detachedThresholdMs =
            tuning?.detachedThresholdMs ?? DETACHED_EXEC_THRESHOLD_MS;
        this.pollIntervalMs =
            tuning?.pollIntervalMs ?? DETACHED_POLL_INTERVAL_MS;
    }

    private url(path: string, params?: Record<string, string>): string {
        const url = new URL(`${this.baseUrl}${path}`);
        url.searchParams.set('api-version', this.apiVersion);
        if (params) {
            for (const [key, value] of Object.entries(params)) {
                url.searchParams.set(key, value);
            }
        }
        return url.toString();
    }

    private async authToken(forceRefresh = false): Promise<string> {
        if (forceRefresh || this.token === null) {
            this.token = await this.mintToken();
        }
        return this.token;
    }

    /** Send a request, re-minting the bearer once on a 401/403 and retrying. */
    private async send(
        url: string,
        init: RequestInit,
        signal?: AbortSignal,
        dispatcher?: Dispatcher,
    ): Promise<Response> {
        const attempt = async (forceRefresh: boolean): Promise<Response> => {
            const token = await this.authToken(forceRefresh);
            const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
                ...init,
                dispatcher,
                signal: signal ?? null,
                headers: {
                    ...init.headers,
                    authorization: `Bearer ${token}`,
                },
            };
            return fetch(url, requestInit);
        };
        const response = await attempt(false);
        if (response.status === 401 || response.status === 403) {
            return attempt(true);
        }
        return response;
    }

    readonly commands: SandboxCommands = {
        run: async (
            command: string,
            options?: RunOptions,
        ): Promise<CommandResult> => {
            // A run allowed to outlive the gateway's ~600s per-request cap
            // cannot be one buffered call — detach it and poll instead.
            if (
                options?.timeoutMs !== undefined &&
                options.timeoutMs > this.detachedThresholdMs
            ) {
                return this.runDetached(command, {
                    ...options,
                    timeoutMs: options.timeoutMs,
                });
            }
            return this.runBuffered(command, options);
        },
    };

    /** One buffered exec round-trip: the response arrives when the command completes. */
    private async runBuffered(
        command: string,
        options?: RunOptions,
    ): Promise<CommandResult> {
        const controller = new AbortController();
        // Give the native exec a 5s grace period over the caller's timeout so
        // the server's own timeout error surfaces before this client-side abort.
        const abortAfterMs =
            options?.timeoutMs && options.timeoutMs > 0
                ? options.timeoutMs + 5_000
                : null;
        const timer = abortAfterMs
            ? setTimeout(() => controller.abort(), abortAfterMs)
            : null;
        try {
            const response = await this.send(
                this.url(EXEC_PATH),
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        command: buildCommandLine(command, options),
                    }),
                },
                controller.signal,
                abortAfterMs ? bufferedExecDispatcher : undefined,
            );
            if (!response.ok) {
                throw new SandboxCommandError(
                    response.status,
                    await response.text().catch(() => ''),
                    '',
                );
            }
            const result = decodeExecResponse(await response.json());
            // Native exec is buffered — replay the captured output through the
            // streaming callbacks once so downstream line-parsers still see it.
            if (result.stdout) options?.onStdout?.(result.stdout);
            if (result.stderr) options?.onStderr?.(result.stderr);
            if (result.exitCode !== 0) {
                throw new SandboxCommandError(
                    result.exitCode,
                    result.stderr,
                    result.stdout,
                );
            }
            return result;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new SandboxTimeoutError(
                    `Command timed out after ${abortAfterMs}ms (configured ${options?.timeoutMs}ms)`,
                );
            }
            throw error;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /**
     * Best-effort stop of a detached run's entire process group: TERM for a
     * graceful window, then KILL. Targets the negative PGID recorded at start
     * (see the setsid note in {@link runDetached}) — killing only the wrapper
     * shell PID would orphan its children. Never throws: this runs on paths
     * that are already reporting a failure.
     */
    private async killDetachedProcessGroup(runDir: string): Promise<void> {
        await this.runBuffered(
            `if [ -f ${runDir}/pid ]; then PGID="$(cat ${runDir}/pid)"; ` +
                `kill -TERM -- "-$PGID" 2>/dev/null; sleep 2; ` +
                `kill -KILL -- "-$PGID" 2>/dev/null; fi; true`,
            { timeoutMs: INTERNAL_EXEC_TIMEOUT_MS },
        ).catch(() => {});
    }

    /**
     * Run a long command without ever holding a data-plane request open for its
     * duration: start it detached under nohup with its streams and exit code
     * captured to files (a ~1s request), then poll those files with short
     * requests, replaying new bytes through `onStdout`/`onStderr` as they land.
     *
     * This is what makes >10-minute runs (Claude generation turns) possible on
     * Azure, restores incremental streaming that buffered exec cannot provide,
     * and survives transient poll failures — the process keeps running in the
     * sandbox and the next successful poll re-attaches to its files.
     */
    private async runDetached(
        command: string,
        options: RunOptions & { timeoutMs: number },
    ): Promise<CommandResult> {
        const runDir = `/tmp/.lightdash-exec/${randomUUID()}`;
        // cwd/envs are folded into the inner command line; the subshell keeps
        // compound inner commands (a && b) under one redirect.
        const inner = buildCommandLine(command, options);
        const wrapped = `( ${inner} ) > ${runDir}/out.log 2> ${runDir}/err.log; echo $? > ${runDir}/exit`;
        // setsid makes the wrapper the leader of a fresh process group whose
        // PGID equals the recorded PID, so a kill can target the whole command
        // tree (`kill -- -PID`) — signalling only the wrapper shell would
        // orphan its children (claude, pnpm, …). The backgrounded child of a
        // non-job-control shell is never already a group leader, so setsid
        // execs in place and `$!` is reliably the leader's PID.
        await this.runBuffered(
            `mkdir -p ${runDir}; nohup setsid /bin/sh -c ${shQuote(wrapped)} < /dev/null > /dev/null 2>&1 & echo $! > ${runDir}/pid`,
            { timeoutMs: INTERNAL_EXEC_TIMEOUT_MS },
        );

        const startedAt = Date.now();
        // StringDecoder holds back a multi-byte UTF-8 sequence split across
        // poll boundaries instead of emitting a corrupt character.
        const outDecoder = new StringDecoder('utf8');
        const errDecoder = new StringDecoder('utf8');
        let outOffset = 0;
        let errOffset = 0;
        let stdout = '';
        let stderr = '';
        let consecutiveFailures = 0;

        for (;;) {
            const elapsedMs = Date.now() - startedAt;
            if (elapsedMs >= options.timeoutMs) {
                // Best-effort stop; without it the process would outlive the
                // timeout exactly like the gateway-504 case this replaces.
                // eslint-disable-next-line no-await-in-loop
                await this.killDetachedProcessGroup(runDir);
                throw new SandboxTimeoutError(
                    `Command timed out after ${elapsedMs}ms (configured ${options.timeoutMs}ms)`,
                );
            }

            // eslint-disable-next-line no-await-in-loop
            await sleep(this.pollIntervalMs);

            let tick: DetachedTick;
            try {
                // eslint-disable-next-line no-await-in-loop
                const response = await this.runBuffered(
                    `printf S; cat ${runDir}/exit 2>/dev/null; echo; ` +
                        `printf O; tail -c +${outOffset + 1} ${runDir}/out.log 2>/dev/null | base64 | tr -d '\\n'; echo; ` +
                        `printf E; tail -c +${errOffset + 1} ${runDir}/err.log 2>/dev/null | base64 | tr -d '\\n'; echo`,
                    { timeoutMs: INTERNAL_EXEC_TIMEOUT_MS },
                );
                tick = parseDetachedTick(response.stdout);
                consecutiveFailures = 0;
            } catch (error) {
                consecutiveFailures += 1;
                if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
                    // Abandoning the run must not orphan the command tree — a
                    // caller's retry could otherwise run alongside it.
                    // eslint-disable-next-line no-await-in-loop
                    await this.killDetachedProcessGroup(runDir);
                    throw new SandboxCommandError(
                        -1,
                        `Detached exec polling failed ${consecutiveFailures} times in a row: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                        stdout,
                    );
                }
                // eslint-disable-next-line no-continue
                continue;
            }

            outOffset += tick.out.length;
            errOffset += tick.err.length;
            const outText = outDecoder.write(tick.out);
            if (outText) {
                stdout += outText;
                options.onStdout?.(outText);
            }
            const errText = errDecoder.write(tick.err);
            if (errText) {
                stderr += errText;
                options.onStderr?.(errText);
            }

            if (tick.exitCode !== null) {
                if (tick.exitCode !== 0) {
                    // Keep runDir on failure so the logs survive for post-mortem.
                    throw new SandboxCommandError(
                        tick.exitCode,
                        stderr,
                        stdout,
                    );
                }
                // eslint-disable-next-line no-await-in-loop
                await this.files.remove(runDir).catch(() => {});
                return { stdout, stderr, exitCode: 0 };
            }
        }
    }

    readonly files: SandboxFiles = {
        read: async (path: string): Promise<string> => {
            const response = await this.send(this.url(FILES_PATH, { path }), {
                method: 'GET',
            });
            if (!response.ok) {
                throw new SandboxCommandError(
                    response.status,
                    `failed to read ${path}: ${await response
                        .text()
                        .catch(() => '')}`,
                    '',
                );
            }
            return response.text();
        },
        readBytes: async (path: string): Promise<Buffer> => {
            const response = await this.send(this.url(FILES_PATH, { path }), {
                method: 'GET',
            });
            if (!response.ok) {
                throw new SandboxCommandError(
                    response.status,
                    `failed to read ${path}: ${await response
                        .text()
                        .catch(() => '')}`,
                    '',
                );
            }
            return Buffer.from(await response.arrayBuffer());
        },
        write: async (
            path: string,
            contents: string | Uint8Array,
        ): Promise<void> => {
            const body =
                typeof contents === 'string'
                    ? Buffer.from(contents, 'utf8')
                    : Buffer.from(contents);
            const response = await this.send(
                this.url(FILES_PATH, { path, createDirs: 'true' }),
                {
                    method: 'PUT',
                    headers: { 'content-type': 'application/octet-stream' },
                    body,
                },
            );
            if (!response.ok) {
                throw new SandboxCommandError(
                    response.status,
                    `failed to write ${path}: ${await response
                        .text()
                        .catch(() => '')}`,
                    '',
                );
            }
        },
        remove: async (path: string): Promise<void> => {
            // Idempotent: the data plane returns 200/204 even when the path is gone.
            await this.send(this.url(FILES_PATH, { path, recursive: 'true' }), {
                method: 'DELETE',
            });
        },
    };
}
