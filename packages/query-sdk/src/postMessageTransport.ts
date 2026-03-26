/**
 * postMessage transport — executes queries by delegating to a parent window
 * via the structured clone postMessage API.
 *
 * Used when the SDK runs inside a sandboxed iframe (sandbox="allow-scripts")
 * and cannot make direct API calls. The parent window receives the request,
 * executes the query using its own session, and sends the result back.
 */

import type {
    Column,
    FormatFunction,
    LightdashUser,
    QueryDefinition,
    QueryResult,
    Row,
    Transport,
} from './types';

// ---------------------------------------------------------------------------
// Protocol types — shared with the parent-side bridge (useAppSdkBridge)
// ---------------------------------------------------------------------------

export type SdkRequestMessage = {
    type: 'lightdash:sdk:request';
    id: string;
    method: 'executeQuery' | 'getUser';
    payload?: QueryDefinition;
};

export type SdkResponseMessage = {
    type: 'lightdash:sdk:response';
    id: string;
    result?: SerializedQueryResult | LightdashUser;
    error?: string;
};

export type SdkReadyMessage = {
    type: 'lightdash:sdk:ready';
};

export type SerializedQueryResult = {
    rows: Row[];
    columns: Column[];
    /** Parallel to `rows` — formatted display strings for each field. */
    formattedRows: Array<Record<string, string>>;
};

// ---------------------------------------------------------------------------
// Transport implementation
// ---------------------------------------------------------------------------

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

type PostMessageTransportConfig = {
    /** The window to post requests to (typically `window.parent`). */
    targetWindow: Window;
    /** Timeout per request in ms. Defaults to 120_000 (2 minutes). */
    timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 10_000;

/**
 * Creates a Transport that communicates with a parent window via postMessage.
 */
export function createPostMessageTransport(
    config: PostMessageTransportConfig,
): Transport & { dispose: () => void } {
    const { targetWindow, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
    const pending = new Map<string, PendingRequest>();

    let readyResolve: (() => void) | null = null;
    const readyPromise = new Promise<void>((resolve) => {
        readyResolve = resolve;
    });
    const readyTimer = setTimeout(() => {
        readyResolve?.();
    }, READY_TIMEOUT_MS);

    const handleMessage = (event: MessageEvent): void => {
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

        if (data.type === 'lightdash:sdk:response') {
            const msg = data as SdkResponseMessage;
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
    };

    window.addEventListener('message', handleMessage);

    function sendRequest(
        method: SdkRequestMessage['method'],
        payload?: QueryDefinition,
    ): Promise<unknown> {
        const id = crypto.randomUUID();
        const message: SdkRequestMessage = {
            type: 'lightdash:sdk:request',
            id,
            method,
            payload,
        };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`SDK request '${method}' timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            pending.set(id, { resolve, reject, timer });

            readyPromise.then(() => {
                targetWindow.postMessage(message, '*');
            });
        });
    }

    /**
     * Reconstruct a FormatFunction from serialized formattedRows.
     * Builds a cache keyed by (fieldId, rawValue) → formattedString.
     */
    function buildFormatFunction(
        rows: Row[],
        formattedRows: Array<Record<string, string>>,
    ): FormatFunction {
        const cache = new Map<string, Map<unknown, string>>();
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const formatted = formattedRows[i];
            if (!formatted) continue;
            for (const fieldId of Object.keys(formatted)) {
                if (!cache.has(fieldId)) {
                    cache.set(fieldId, new Map());
                }
                cache.get(fieldId)!.set(row[fieldId], formatted[fieldId]);
            }
        }
        return (row: Row, fieldId: string): string => {
            const rawVal = row[fieldId];
            const fieldCache = cache.get(fieldId);
            if (fieldCache) {
                const result = fieldCache.get(rawVal);
                if (result !== undefined) return result;
            }
            return String(rawVal ?? '');
        };
    }

    return {
        async executeQuery(query: QueryDefinition): Promise<QueryResult> {
            const raw = (await sendRequest('executeQuery', query)) as SerializedQueryResult;
            return {
                rows: raw.rows,
                columns: raw.columns,
                format: buildFormatFunction(raw.rows, raw.formattedRows),
            };
        },

        async getUser(): Promise<LightdashUser> {
            return (await sendRequest('getUser')) as LightdashUser;
        },

        dispose(): void {
            window.removeEventListener('message', handleMessage);
            clearTimeout(readyTimer);
            for (const [id, req] of pending) {
                clearTimeout(req.timer);
                req.reject(new Error('Transport disposed'));
                pending.delete(id);
            }
        },
    };
}
