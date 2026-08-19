import type { TdcpColumnSchema, TdcpDatasetDescriptor } from './types';

const DEFAULT_TTL_MS = 15 * 60_000;
const DEFAULT_MAX_ROWS = 100_000;

export type MintDatasetArgs = {
    schema: TdcpColumnSchema[];
    rows: Record<string, unknown>[];
    /**
     * The principal the dataset is bound to; reads under a different
     * principal are refused. null = the server serves a single principal.
     */
    principal: string | null;
    cacheHit?: boolean;
};

/**
 * The result of a data-plane read, shaped for a transport to map onto
 * status codes — explicit outcomes, not exceptions as control flow.
 */
export type DataPlaneRead =
    | { kind: 'ok'; rows: Record<string, unknown>[] }
    | { kind: 'unauthorized' }
    | { kind: 'notFound' };

/** Length-guarded constant-time comparison, no node builtins. */
const tokensEqual = (left: string, right: string): boolean => {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
        // eslint-disable-next-line no-bitwise
        diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
};

/**
 * In-memory dataset runtime for examples and tests: mint a descriptor
 * (opaque id, per-dataset bearer token, principal binding, expiry, data-
 * plane link) and answer data-plane reads. Handlers produce rows; this owns
 * the handle lifecycle. It buffers rows in memory and caps their count —
 * production servers stream from real storage instead.
 */
export class TdcpDatasetStore {
    private readonly datasets = new Map<
        string,
        {
            rows: Record<string, unknown>[];
            token: string;
            principal: string | null;
            expiresAtMs: number;
        }
    >();

    private readonly baseUrl: string;

    private readonly ttlMs: number;

    private readonly maxRows: number;

    constructor(args: { baseUrl: string; ttlMs?: number; maxRows?: number }) {
        this.baseUrl = args.baseUrl.replace(/\/$/, '');
        this.ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
        this.maxRows = args.maxRows ?? DEFAULT_MAX_ROWS;
    }

    private prune(): void {
        const now = Date.now();
        for (const [id, dataset] of this.datasets) {
            if (dataset.expiresAtMs <= now) this.datasets.delete(id);
        }
    }

    mint(args: MintDatasetArgs): TdcpDatasetDescriptor {
        this.prune();
        if (args.rows.length > this.maxRows) {
            throw new Error(
                `TdcpDatasetStore holds datasets in memory and caps them at ${this.maxRows} rows — stream from real storage for more`,
            );
        }
        const datasetId = `ds_${globalThis.crypto.randomUUID()}`;
        const token = `tok_${globalThis.crypto.randomUUID()}`;
        const expiresAtMs = Date.now() + this.ttlMs;
        this.datasets.set(datasetId, {
            rows: args.rows,
            token,
            principal: args.principal,
            expiresAtMs,
        });
        const expiresAt = new Date(expiresAtMs).toISOString();
        return {
            status: 'ready',
            datasetId,
            schema: args.schema,
            rowCount: args.rows.length,
            producedAt: new Date().toISOString(),
            expiresAt,
            freshness: {
                sourceQueriedAt: new Date().toISOString(),
                cacheHit: args.cacheHit ?? false,
            },
            links: [
                {
                    encoding: 'jsonl',
                    href: `${this.baseUrl}/data/${datasetId}`,
                    token,
                    expiresAt,
                },
            ],
        };
    }

    read(
        datasetId: string,
        bearerToken: string | null,
        principal: string | null,
    ): DataPlaneRead {
        this.prune();
        const dataset = this.datasets.get(datasetId);
        if (!dataset || dataset.expiresAtMs <= Date.now()) {
            return { kind: 'notFound' };
        }
        if (bearerToken === null || !tokensEqual(bearerToken, dataset.token)) {
            return { kind: 'unauthorized' };
        }
        if (dataset.principal !== principal) {
            return { kind: 'unauthorized' };
        }
        return { kind: 'ok', rows: dataset.rows };
    }
}
