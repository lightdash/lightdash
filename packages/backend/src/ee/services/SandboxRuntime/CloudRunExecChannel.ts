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
 * Fold `cwd`/`envs` into a single `/bin/sh -c` command line. The gateway exec
 * takes only a command (its own `--workdir`/`-e` flags exist but folding keeps
 * one wire shape for buffered and detached runs alike).
 *
 * `export PATH;` first: the sandbox exec shell has a PATH *variable* (with
 * /usr/local/bin) but does not export it, so child processes fall back to
 * glibc's `/bin:/usr/bin` default and `#!/usr/bin/env node` shebangs (pnpm,
 * npx) fail with ENOENT. Exporting the shell's own PATH fixes every descendant.
 *
 * The Claude Code kill-switches guard against a sandbox-launcher fault
 * (reproduced Jul 2026, preview): a process that starts `node` as a setsid
 * session leader kills the whole sandbox (its control server dies; every
 * subsequent exec fails with "connection refused"). Claude Code is a bundled
 * node binary whose auto-updater / background tasks spawn exactly that shape
 * ~90s into a run, so they are disabled for every command in the sandbox —
 * they only affect the `claude` CLI and are harmless to other commands.
 */
const buildCommandLine = (command: string, options?: RunOptions): string => {
    const parts: string[] = [
        'export PATH DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1;',
    ];
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
 * The gateway exec endpoint is buffered: response headers arrive only when the
 * shell command completes, so undici's default 300s headersTimeout would kill
 * longer runs with `fetch failed`. This dispatcher disables undici's clocks and
 * is used ONLY for exec calls already bounded by the caller's AbortController.
 */
const bufferedExecDispatcher = new Agent({
    headersTimeout: 0,
    bodyTimeout: 0,
});

/**
 * Runs bounded above this threshold switch to detached mode (start under
 * nohup, poll output files with short requests) — the Azure channel's pattern.
 *
 * Set just under the gateway's 3600s Cloud Run request timeout, so in practice
 * every run is one buffered exec: with the sandbox launcher in preview,
 * long-lived processes started detached (no live exec session) have repeatedly
 * taken the whole sandbox down mid-run ("connecting to control server …
 * connection refused" on every later exec), while identical foreground
 * workloads survive. Detached mode remains as the fallback for runs bounded
 * beyond the request cap.
 */
const DETACHED_EXEC_THRESHOLD_MS = 58 * 60 * 1000;
const DETACHED_POLL_INTERVAL_MS = 2_000;
/** Poll/start/kill requests are short; bound them individually. */
const INTERNAL_EXEC_TIMEOUT_MS = 60 * 1000;
/**
 * A failed poll leaves the detached process running, so transient gateway
 * hiccups are survivable — only this many consecutive failures abort the run.
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

/**
 * Every command reaches the sandbox as one `/bin/sh -c <string>` argv entry and
 * Linux caps a single argv string at 128KiB (MAX_ARG_STRLEN), so file writes
 * are chunked base64 appends sized to stay well under that cap after base64
 * expansion (64KiB binary → ~86KiB base64 + command scaffolding).
 */
const WRITE_CHUNK_BYTES = 64 * 1024;
/**
 * Reads stream through a pipe (no argv limit); the bound is the gateway's
 * buffered JSON response, so chunks can be much larger.
 */
const READ_CHUNK_BYTES = 4 * 1024 * 1024;

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/** The gateway exec wire result (`{stdout, stderr, exitCode}` JSON). */
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
 * the new stdout/stderr bytes since the last poll. Throws on malformed output —
 * the caller treats that as a transient poll failure.
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

/** Validate/narrow the gateway exec JSON to {@link ExecResponse}. */
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

/**
 * HTTP client for the ComputeSDK Cloud Run sandbox gateway — a Cloud Run
 * service deployed with `--sandbox-launcher` that fronts the in-instance
 * `sandbox` CLI with a small JSON API (`/v1/sandbox/create|exec|destroy`),
 * authenticated with a static shared secret header. Sandbox ids must match the
 * gateway's `[A-Za-z0-9_-]+` rule.
 */
export class CloudRunGatewayClient {
    private readonly baseUrl: string;

    constructor(
        sandboxUrl: string,
        private readonly sandboxSecret: string,
    ) {
        this.baseUrl = sandboxUrl.replace(/\/+$/, '');
    }

    async post(
        path: string,
        body: Record<string, unknown>,
        options?: { signal?: AbortSignal; dispatcher?: Dispatcher },
    ): Promise<unknown> {
        const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-computesdk-cloud-run-secret': this.sandboxSecret,
            },
            body: JSON.stringify(body),
            signal: options?.signal ?? null,
            dispatcher: options?.dispatcher,
        };
        const response = await fetch(
            `${this.baseUrl}/v1/sandbox/${path}`,
            requestInit,
        );
        if (!response.ok) {
            // Gateway error bodies are untrusted — truncate rather than
            // echoing them verbatim into logs/Sentry.
            const text = await response.text().catch(() => '');
            throw new SandboxCommandError(
                response.status,
                `Cloud Run sandbox gateway ${path} failed: ${text.slice(0, 200)}`,
                '',
            );
        }
        return response.json();
    }

    /** `sandbox run <id> --detach` behind the gateway. */
    async createSandbox(input: {
        sandboxId: string;
        allowEgress: boolean;
        envs: Record<string, string> | null;
    }): Promise<void> {
        await this.post('create', {
            sandboxId: input.sandboxId,
            write: true,
            allowEgress: input.allowEgress,
            env: input.envs ?? {},
        });
    }

    /** `sandbox delete <id>` behind the gateway. Fire-and-forget on the server. */
    async destroySandbox(sandboxId: string): Promise<void> {
        await this.post('destroy', { sandboxId });
    }
}

/**
 * Data plane for one Cloud Run sandbox, built entirely on the gateway's
 * stateful exec endpoint (`sandbox exec <id>`): commands are buffered
 * round-trips (or detached-and-polled beyond the threshold), and files are
 * implemented over exec with base64 chunking sized to the argv limit — the
 * gateway's own read/write endpoints embed whole payloads in a single command
 * string, which breaks on anything large.
 */
export class CloudRunExecChannel {
    private readonly detachedThresholdMs: number;

    private readonly pollIntervalMs: number;

    constructor(
        private readonly client: CloudRunGatewayClient,
        private readonly sandboxId: string,
        tuning?: { detachedThresholdMs?: number; pollIntervalMs?: number },
    ) {
        this.detachedThresholdMs =
            tuning?.detachedThresholdMs ?? DETACHED_EXEC_THRESHOLD_MS;
        this.pollIntervalMs =
            tuning?.pollIntervalMs ?? DETACHED_POLL_INTERVAL_MS;
    }

    readonly commands: SandboxCommands = {
        run: async (
            command: string,
            options?: RunOptions,
        ): Promise<CommandResult> => {
            // A run allowed to outlive the gateway's per-request exec cap
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
        const timeoutMs = options?.timeoutMs;
        const timer =
            timeoutMs && timeoutMs > 0
                ? setTimeout(() => controller.abort(), timeoutMs)
                : null;
        try {
            const raw = await this.client.post(
                'exec',
                {
                    sandboxId: this.sandboxId,
                    command: buildCommandLine(command, options),
                    // Server-side backstop 10s past the client abort so the
                    // spawn is reaped even if this client goes away. Unbounded
                    // runs get the internal cap — callers wanting longer must
                    // pass a timeout (and thereby detach past the threshold).
                    timeout: (timeoutMs ?? INTERNAL_EXEC_TIMEOUT_MS) + 10_000,
                },
                {
                    signal: controller.signal,
                    dispatcher: timer ? bufferedExecDispatcher : undefined,
                },
            );
            const result = decodeExecResponse(raw);
            // The gateway reports its own spawn timeout as exit 124.
            if (result.exitCode === 124 && /timed out/i.test(result.stderr)) {
                throw new SandboxTimeoutError(
                    `Command timed out on the gateway (configured ${timeoutMs}ms)`,
                );
            }
            // Buffered exec — replay the captured output through the streaming
            // callbacks once so downstream line-parsers still see it.
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
                    `Command timed out after ${timeoutMs}ms`,
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
     * (see the setsid note in {@link runDetached}). Never throws: this runs on
     * paths that are already reporting a failure.
     */
    private async killDetachedProcessGroup(runDir: string): Promise<void> {
        const pidFile = shQuote(`${runDir}/pid`);
        await this.runBuffered(
            `if [ -f ${pidFile} ]; then PGID="$(cat ${pidFile})"; ` +
                `kill -TERM -- "-$PGID" 2>/dev/null; sleep 2; ` +
                `kill -KILL -- "-$PGID" 2>/dev/null; fi; true`,
            { timeoutMs: INTERNAL_EXEC_TIMEOUT_MS },
        ).catch(() => {});
    }

    /**
     * Run a long command without ever holding a gateway request open for its
     * duration: start it detached under nohup with its streams and exit code
     * captured to files (a ~1s request), then poll those files with short
     * requests, replaying new bytes through `onStdout`/`onStderr` as they land.
     * The process keeps running in the sandbox across transient poll failures.
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
        // orphan its children (claude, pnpm, …).
        await this.runBuffered(
            `mkdir -p ${shQuote(runDir)}; nohup setsid /bin/sh -c ${shQuote(wrapped)} < /dev/null > /dev/null 2>&1 & echo $! > ${shQuote(`${runDir}/pid`)}`,
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
                    `printf S; cat ${shQuote(`${runDir}/exit`)} 2>/dev/null; echo; ` +
                        `printf O; tail -c +${outOffset + 1} ${shQuote(`${runDir}/out.log`)} 2>/dev/null | base64 | tr -d '\\n'; echo; ` +
                        `printf E; tail -c +${errOffset + 1} ${shQuote(`${runDir}/err.log`)} 2>/dev/null | base64 | tr -d '\\n'; echo`,
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
                // Flush bytes the decoders held back waiting for the rest of a
                // multi-byte sequence that never came.
                const outTail = outDecoder.end();
                if (outTail) {
                    stdout += outTail;
                    options.onStdout?.(outTail);
                }
                const errTail = errDecoder.end();
                if (errTail) {
                    stderr += errTail;
                    options.onStderr?.(errTail);
                }
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
            const bytes = await this.files.readBytes(path);
            return bytes.toString('utf8');
        },
        readBytes: async (path: string): Promise<Buffer> => {
            const quoted = shQuote(path);
            const sizeResult = await this.runBuffered(`wc -c < ${quoted}`, {
                timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
            });
            const size = Number(sizeResult.stdout.trim());
            if (!Number.isInteger(size)) {
                throw new SandboxCommandError(
                    -1,
                    `could not size ${path}: ${sizeResult.stdout.slice(0, 100)}`,
                    '',
                );
            }
            const chunks: Buffer[] = [];
            for (let offset = 0; offset < size; offset += READ_CHUNK_BYTES) {
                // eslint-disable-next-line no-await-in-loop
                const result = await this.runBuffered(
                    `tail -c +${offset + 1} ${quoted} | head -c ${READ_CHUNK_BYTES} | base64 | tr -d '\\n'`,
                    { timeoutMs: INTERNAL_EXEC_TIMEOUT_MS },
                );
                chunks.push(Buffer.from(result.stdout, 'base64'));
            }
            return Buffer.concat(chunks);
        },
        write: async (
            path: string,
            contents: string | Uint8Array,
        ): Promise<void> => {
            const buffer =
                typeof contents === 'string'
                    ? Buffer.from(contents, 'utf8')
                    : Buffer.from(contents);
            const quoted = shQuote(path);
            const dir = shQuote(
                path.includes('/')
                    ? path.slice(0, path.lastIndexOf('/')) || '/'
                    : '.',
            );
            await this.runBuffered(`mkdir -p ${dir} && : > ${quoted}`, {
                timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
            });
            for (
                let offset = 0;
                offset < buffer.length;
                offset += WRITE_CHUNK_BYTES
            ) {
                const chunk = buffer
                    .subarray(offset, offset + WRITE_CHUNK_BYTES)
                    .toString('base64');
                // eslint-disable-next-line no-await-in-loop
                await this.runBuffered(
                    `printf '%s' '${chunk}' | base64 -d >> ${quoted}`,
                    { timeoutMs: INTERNAL_EXEC_TIMEOUT_MS },
                );
            }
        },
        remove: async (path: string): Promise<void> => {
            await this.runBuffered(`rm -rf ${shQuote(path)}`, {
                timeoutMs: INTERNAL_EXEC_TIMEOUT_MS,
            }).catch(() => {});
        },
    };
}
