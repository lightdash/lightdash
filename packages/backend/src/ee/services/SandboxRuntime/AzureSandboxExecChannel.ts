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
 *   result), so a long run streams nothing until it finishes — `onStdout`/`onStderr`
 *   fire once with the full output.
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

interface ExecResponse {
    stdout: string;
    stderr: string;
    exitCode: number;
}

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

    /**
     * @param baseUrl the sandbox-scoped data-plane URL built by the control plane
     *   (region endpoint + sandbox resource path), e.g.
     *   `https://<region>.management.azuredevcompute.io/…/sandboxes/<id>`.
     * @param apiVersion the ADC data-plane API version (query param on every call).
     * @param mintToken mints a fresh Entra bearer for the data-plane audience.
     *   Called lazily on first use and again to refresh after an auth rejection,
     *   so a turn that outlives its token self-heals.
     */
    constructor(
        baseUrl: string,
        private readonly apiVersion: string,
        private readonly mintToken: () => Promise<string>,
    ) {
        // Trailing slash stripped so path concatenation is predictable.
        this.baseUrl = baseUrl.replace(/\/+$/, '');
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
                if (
                    error instanceof DOMException &&
                    error.name === 'AbortError'
                ) {
                    throw new SandboxTimeoutError(
                        `Command timed out after ${abortAfterMs}ms (configured ${options?.timeoutMs}ms)`,
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
