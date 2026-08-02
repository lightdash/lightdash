import { SandboxCommandError, SandboxTimeoutError } from './errors';
import {
    type CommandResult,
    type RunOptions,
    type SandboxCommands,
    type SandboxFiles,
} from './types';

/**
 * Data plane for a Lambda MicroVM: an HTTP client to the in-microVM exec agent
 * (the sandbox-image agent — Workstream 2). Lambda ships no native exec SDK, so
 * `commands`/`files` run over the microVM's HTTPS proxy `endpoint`, authenticated
 * with the JWE bearer minted by `CreateMicrovmAuthToken` and sent as the
 * `X-aws-proxy-auth` header (the AWS connector terminates it; the agent trusts
 * inbound). `git` is layered on top of `commands.run` by {@link createGitOverCommands}.
 *
 * **The agent contract** (kept in lock-step with the agent in Workstream 2):
 * - `POST /exec` JSON `{cmd, cwd?, envs?, timeoutMs?}` → a stream of
 *   newline-delimited JSON events: `{"stream":"stdout"|"stderr","data":<base64>}`
 *   chunks then a terminal `{"exitCode":<n>}` or `{"timeout":true}`.
 * - `GET /files?path=` → raw bytes (200) / 404; `POST /files?path=` raw body →
 *   write (creates parent dirs); `DELETE /files?path=` → idempotent remove.
 */
const AGENT_PORT_HEADER = 'X-aws-proxy-port';
const AGENT_PORT = '8080';
const AUTH_HEADER = 'X-aws-proxy-auth';

type ExecEvent =
    | { stream: 'stdout' | 'stderr'; data: string }
    | { exitCode: number }
    | { timeout: true };

const isExecEvent = (value: unknown): value is ExecEvent => {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    if (record.timeout === true) return true;
    if (typeof record.exitCode === 'number') return true;
    return (
        (record.stream === 'stdout' || record.stream === 'stderr') &&
        typeof record.data === 'string'
    );
};

/**
 * Drain the newline-delimited JSON event stream, firing `onStdout`/`onStderr`
 * as chunks arrive and resolving on the terminal event. Like the other
 * providers, a non-zero exit throws {@link SandboxCommandError}; a timeout throws
 * {@link SandboxTimeoutError}.
 */
const consumeExecStream = async (
    body: ReadableStream<Uint8Array>,
    command: string,
    options: RunOptions | undefined,
): Promise<CommandResult> => {
    // Iterate the response body as an async stream of byte chunks. This works
    // for both the native undici `ReadableStream` (production, Node 22) and
    // node-fetch's Node `Readable` (test env) without branching.
    const chunks = body as unknown as AsyncIterable<Uint8Array>;
    const decoder = new TextDecoder();
    let buffered = '';
    let stdout = '';
    let stderr = '';

    const handleEvent = (event: ExecEvent): CommandResult | null => {
        if ('timeout' in event) {
            throw new SandboxTimeoutError(
                `Command timed out after ${options?.timeoutMs}ms`,
            );
        }
        if ('exitCode' in event) {
            if (event.exitCode !== 0) {
                throw new SandboxCommandError(event.exitCode, stderr, stdout);
            }
            return { stdout, stderr, exitCode: event.exitCode };
        }
        const text = Buffer.from(event.data, 'base64').toString('utf8');
        if (event.stream === 'stdout') {
            stdout += text;
            options?.onStdout?.(text);
        } else {
            stderr += text;
            options?.onStderr?.(text);
        }
        return null;
    };

    const drainLine = (line: string): CommandResult | null => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return null;
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            // A non-JSON line means a corrupt frame — surface it rather than
            // silently dropping output.
            throw new SandboxCommandError(
                -1,
                `exec agent emitted a non-JSON frame: ${trimmed.slice(0, 200)}`,
                stdout,
            );
        }
        if (!isExecEvent(parsed)) {
            throw new SandboxCommandError(
                -1,
                `exec agent emitted an unknown frame: ${trimmed.slice(0, 200)}`,
                stdout,
            );
        }
        return handleEvent(parsed);
    };

    // eslint-disable-next-line no-restricted-syntax
    for await (const value of chunks) {
        buffered += decoder.decode(value, { stream: true });
        let newlineIndex = buffered.indexOf('\n');
        while (newlineIndex !== -1) {
            const line = buffered.slice(0, newlineIndex);
            buffered = buffered.slice(newlineIndex + 1);
            const result = drainLine(line);
            if (result) return result;
            newlineIndex = buffered.indexOf('\n');
        }
    }
    // Flush any final line without a trailing newline.
    const result = drainLine(buffered);
    if (result) return result;
    throw new SandboxCommandError(
        -1,
        `exec agent stream ended without an exit code for: ${command}`,
        stdout,
    );
};

export class LambdaExecChannel {
    private token: string | null = null;

    private readonly baseUrl: string;

    /**
     * @param endpoint the microVM proxy endpoint from `RunMicrovm`/`GetMicrovm`.
     *   AWS returns this as a bare hostname (no scheme), so we default it to
     *   `https://` — it is an HTTPS endpoint. A scheme is honored if already present
     *   (e.g. `http://` for a local test server).
     * @param mintToken mints a fresh `X-aws-proxy-auth` bearer. Called lazily on
     *   first use and again to refresh after an auth rejection, so a turn that
     *   outlives its token (open item: long Claude runs > token TTL) self-heals.
     */
    constructor(
        endpoint: string,
        private readonly mintToken: () => Promise<string>,
    ) {
        this.baseUrl = /^https?:\/\//.test(endpoint)
            ? endpoint
            : `https://${endpoint}`;
    }

    private url(path: string): string {
        return new URL(path, this.baseUrl).toString();
    }

    private async authToken(forceRefresh = false): Promise<string> {
        if (forceRefresh || this.token === null) {
            this.token = await this.mintToken();
        }
        return this.token;
    }

    /** Send a request, re-minting the bearer once on a 401/403 and retrying. */
    private async send(
        path: string,
        init: RequestInit,
        signal?: AbortSignal,
    ): Promise<Response> {
        const attempt = async (forceRefresh: boolean): Promise<Response> => {
            const token = await this.authToken(forceRefresh);
            return fetch(this.url(path), {
                ...init,
                signal: signal ?? null,
                headers: {
                    ...init.headers,
                    [AUTH_HEADER]: token,
                    [AGENT_PORT_HEADER]: AGENT_PORT,
                },
            });
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
            const controller = new AbortController();
            const timer =
                options?.timeoutMs && options.timeoutMs > 0
                    ? setTimeout(
                          () => controller.abort(),
                          // Grace over the agent's own deadline so the agent's
                          // `{"timeout":true}` event wins the race when it can.
                          options.timeoutMs + 5_000,
                      )
                    : null;
            try {
                const response = await this.send(
                    '/exec',
                    {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                            cmd: command,
                            cwd: options?.cwd,
                            envs: options?.envs,
                            timeoutMs: options?.timeoutMs,
                        }),
                    },
                    controller.signal,
                );
                if (!response.ok || response.body === null) {
                    throw new SandboxCommandError(
                        response.status,
                        await response.text().catch(() => ''),
                        '',
                    );
                }
                return await consumeExecStream(response.body, command, options);
            } catch (error) {
                if (
                    error instanceof DOMException &&
                    error.name === 'AbortError'
                ) {
                    throw new SandboxTimeoutError(
                        `Command timed out after ${options?.timeoutMs}ms`,
                    );
                }
                throw error;
            } finally {
                if (timer) clearTimeout(timer);
            }
        },
    };

    readonly files: SandboxFiles = {
        read: async (path: string): Promise<string> => {
            const response = await this.send(
                `/files?path=${encodeURIComponent(path)}`,
                { method: 'GET' },
            );
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
            const response = await this.send(
                `/files?path=${encodeURIComponent(path)}`,
                { method: 'GET' },
            );
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
                `/files?path=${encodeURIComponent(path)}`,
                {
                    method: 'POST',
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
            // Idempotent: the agent returns 200/204 even when the path is gone.
            await this.send(`/files?path=${encodeURIComponent(path)}`, {
                method: 'DELETE',
            });
        },
    };
}
