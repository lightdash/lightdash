/**
 * postMessage transport — routes HTTP requests through the parent window
 * via postMessage instead of calling the API directly.
 *
 * Used when the SDK runs inside a sandboxed iframe (sandbox="allow-scripts")
 * that cannot make direct API calls. The parent receives fetch requests,
 * executes them with its own session cookies, and sends the raw API
 * response back. All query logic (field qualification, polling, result
 * mapping) stays in the SDK's apiTransport.
 */

import { createApiTransport, type FetchAdapter } from './apiTransport';
import type {
    ExternalFetchOptions,
    ExternalFetchResult,
    Transport,
} from './types';

// ---------------------------------------------------------------------------
// Protocol types — shared with the parent-side bridge (useAppSdkBridge)
// ---------------------------------------------------------------------------

export type SdkFetchRequest = {
    type: 'lightdash:sdk:fetch';
    id: string;
    method: string;
    path: string;
    body?: unknown;
    /** Transport metadata for dev tools (not sent to the API) */
    metadata?: Record<string, unknown>;
};

export type SdkFetchResponse = {
    type: 'lightdash:sdk:fetch-response';
    id: string;
    result?: unknown;
    error?: string;
};

export type SdkReadyMessage = {
    type: 'lightdash:sdk:ready';
};

export type SdkScreenshotRequest = {
    type: 'lightdash:sdk:screenshot-request';
    id: string;
};

export type SdkScreenshotResponse = {
    type: 'lightdash:sdk:screenshot-response';
    id: string;
    /** PNG blob rasterized inside the iframe. Absent when `error` is set. */
    blob?: Blob;
    error?: string;
};

/**
 * Announced by the iframe SDK on mount so the parent can detect that
 * screenshot capture is wired up. Older templates running in resumed
 * sandboxes don't send this, so the parent leaves the Screenshot button
 * hidden for them — mirrors the inspector availability handshake.
 */
export type SdkScreenshotAvailableMessage = {
    type: 'lightdash:sdk:screenshot-available';
};

// ---------------------------------------------------------------------------
// Google Sheets export protocol
// ---------------------------------------------------------------------------

export type SdkGsheetExportColumnType =
    | 'string'
    | 'number'
    | 'date'
    | 'timestamp'
    | 'boolean';

export type SdkGsheetExportColumn = {
    key: string;
    label?: string;
    type?: SdkGsheetExportColumnType;
};

export type SdkGsheetExportRow = Record<string, string | number | boolean | null>;

/**
 * Iframe → parent. The parent host (useAppSdkBridge) runs the Google OAuth
 * popup if needed, POSTs to /api/v1/gdrive/upload-gsheet-from-rows, polls
 * the resulting job, and posts back an SdkGsheetExportResponse.
 *
 * Capability-gated on the parent side: hosts that don't opt in respond with
 * an error message.
 */
export type SdkGsheetExportRequest = {
    type: 'lightdash:sdk:gsheet-export-request';
    id: string;
    title: string;
    columns: SdkGsheetExportColumn[];
    rows: SdkGsheetExportRow[];
};

export type SdkGsheetExportResponse = {
    type: 'lightdash:sdk:gsheet-export-response';
    id: string;
    fileUrl?: string;
    error?: string;
};

// ---------------------------------------------------------------------------
// External-fetch protocol — proxies app→external-API calls through the parent
// ---------------------------------------------------------------------------

export type SdkExternalFetchRequest = {
    type: 'lightdash:sdk:external-fetch';
    id: string;
    alias: string;
    method?: 'GET' | 'POST';
    path: string;
    query?: Record<string, string>;
    body?: unknown;
};

export type SdkExternalFetchResponse = {
    type: 'lightdash:sdk:external-fetch-response';
    id: string;
    result?: ExternalFetchResult;
    error?: string;
};

// ---------------------------------------------------------------------------
// postMessage FetchAdapter
// ---------------------------------------------------------------------------

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 10_000;

/**
 * Creates a FetchAdapter that sends HTTP requests to the parent window
 * via postMessage and waits for responses.
 */
function createPostMessageFetchAdapter(config: {
    targetWindow: Window;
    timeoutMs?: number;
}): FetchAdapter {
    const { targetWindow, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
    const pending = new Map<string, PendingRequest>();

    let readyResolve: (() => void) | null = null;
    const readyPromise = new Promise<void>((resolve) => {
        readyResolve = resolve;
    });
    const readyTimer = setTimeout(() => {
        readyResolve?.();
    }, READY_TIMEOUT_MS);

    window.addEventListener('message', (event: MessageEvent) => {
        // Only accept messages from the window we post to (the parent host).
        // The UUID ids already make spoofing hard — this closes the gap cheaply.
        if (event.source !== targetWindow) return;
        const { data } = event;
        if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
            return;
        }

        if (data.type === 'lightdash:sdk:ready') {
            clearTimeout(readyTimer);
            readyResolve?.();
            readyResolve = null;
            return;
        }

        if (data.type === 'lightdash:sdk:fetch-response') {
            const msg = data as SdkFetchResponse;
            const req = pending.get(msg.id);
            if (!req) return;

            clearTimeout(req.timer);
            pending.delete(msg.id);

            if (msg.error) {
                req.reject(new Error(msg.error));
            } else {
                req.resolve(msg.result);
            }
        }
    });

    return async <T>(
        method: string,
        path: string,
        body?: unknown,
        metadata?: Record<string, unknown>,
    ): Promise<T> => {
        await readyPromise;

        const id = crypto.randomUUID();

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`SDK fetch timed out after ${timeoutMs}ms: ${method} ${path}`));
            }, timeoutMs);

            pending.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timer,
            });

            const message: SdkFetchRequest = {
                type: 'lightdash:sdk:fetch',
                id,
                method,
                path,
                body,
                ...(metadata ? { metadata } : {}),
            };
            targetWindow.postMessage(message, '*');
        });
    };
}

// ---------------------------------------------------------------------------
// postMessage ExternalFetch channel
// ---------------------------------------------------------------------------

type ExternalFetchVia = (
    alias: string,
    opts: ExternalFetchOptions,
) => Promise<ExternalFetchResult>;

type PendingExternalFetch = {
    resolve: (value: ExternalFetchResult) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/**
 * Creates an `externalFetch` implementation that posts external-fetch
 * requests to the parent window and resolves the matching response by id.
 * Uses the same readiness gate and timeout discipline as the HTTP adapter.
 */
function createPostMessageExternalFetch(config: {
    targetWindow: Window;
    timeoutMs?: number;
}): ExternalFetchVia {
    const { targetWindow, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
    const pending = new Map<string, PendingExternalFetch>();

    let ready = false;
    let readyResolve: (() => void) | null = null;
    const readyPromise = new Promise<void>((resolve) => {
        readyResolve = () => {
            ready = true;
            resolve();
        };
    });
    const readyTimer = setTimeout(() => {
        readyResolve?.();
    }, READY_TIMEOUT_MS);

    window.addEventListener('message', (event: MessageEvent) => {
        // Only accept messages from the window we post to (the parent host).
        // The UUID ids already make spoofing hard — this closes the gap cheaply.
        if (event.source !== targetWindow) return;
        const { data } = event;
        if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
            return;
        }

        if (data.type === 'lightdash:sdk:ready' && !ready) {
            clearTimeout(readyTimer);
            readyResolve?.();
            readyResolve = null;
            return;
        }

        if (data.type === 'lightdash:sdk:external-fetch-response') {
            const msg = data as SdkExternalFetchResponse;
            const req = pending.get(msg.id);
            if (!req) return;

            clearTimeout(req.timer);
            pending.delete(msg.id);

            if (msg.error) {
                req.reject(new Error(msg.error));
            } else if (msg.result) {
                req.resolve(msg.result);
            } else {
                req.reject(
                    new Error('External fetch returned no result or error'),
                );
            }
        }
    });

    return async (
        alias: string,
        opts: ExternalFetchOptions,
    ): Promise<ExternalFetchResult> => {
        await readyPromise;

        const id = crypto.randomUUID();

        return new Promise<ExternalFetchResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(
                    new Error(
                        `SDK external fetch timed out after ${timeoutMs}ms: ${alias} ${opts.path}`,
                    ),
                );
            }, timeoutMs);

            pending.set(id, { resolve, reject, timer });

            const message: SdkExternalFetchRequest = {
                type: 'lightdash:sdk:external-fetch',
                id,
                alias,
                method: opts.method ?? 'GET',
                path: opts.path,
                ...(opts.query ? { query: opts.query } : {}),
                ...(opts.body !== undefined ? { body: opts.body } : {}),
            };
            targetWindow.postMessage(message, '*');
        });
    };
}

// ---------------------------------------------------------------------------
// Transport factory
// ---------------------------------------------------------------------------

type PostMessageTransportConfig = {
    targetWindow: Window;
    projectUuid: string;
    timeoutMs?: number;
};

/**
 * Creates a Transport that routes all API calls through the parent window
 * via postMessage. The parent acts as a fetch proxy using session cookies.
 *
 * All query logic (field qualification, polling, result mapping) is handled
 * by the SDK's apiTransport — the postMessage layer is just the HTTP adapter.
 */
export function createPostMessageTransport(
    config: PostMessageTransportConfig,
): Transport {
    const adapter = createPostMessageFetchAdapter({
        targetWindow: config.targetWindow,
        timeoutMs: config.timeoutMs,
    });
    const httpTransport = createApiTransport(
        { apiKey: '', baseUrl: '', projectUuid: config.projectUuid },
        adapter,
    );
    const externalFetch = createPostMessageExternalFetch({
        targetWindow: config.targetWindow,
        timeoutMs: config.timeoutMs,
    });
    return {
        ...httpTransport,
        // The apiTransport's externalFetch would route to the parent HTTP
        // proxy + allowlist, which deliberately does NOT include the EE
        // endpoint. Override it with the dedicated external-fetch channel.
        externalFetch,
    };
}
