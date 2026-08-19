import type {
    TdcpColumnSchema,
    TdcpDatasetDescriptor,
    TdcpScanPredicate,
} from './types';

const DEFAULT_TTL_MS = 15 * 60_000;

export type MintDatasetArgs = {
    schema: TdcpColumnSchema[];
    rows: Record<string, unknown>[];
    pushedPredicates?: TdcpScanPredicate[];
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

/**
 * The server-side dataset runtime every TDCP server needs: mint a
 * descriptor (opaque id, per-dataset bearer token, expiry, data-plane
 * link) and answer data-plane reads. Handlers produce rows; this owns the
 * handle lifecycle, so no integrator reinvents token minting or forgets
 * expiry.
 */
export class TdcpDatasetStore {
    private readonly datasets = new Map<
        string,
        { rows: Record<string, unknown>[]; token: string; expiresAtMs: number }
    >();

    private readonly baseUrl: string;

    private readonly ttlMs: number;

    private counter = 0;

    constructor(args: { baseUrl: string; ttlMs?: number }) {
        this.baseUrl = args.baseUrl.replace(/\/$/, '');
        this.ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
    }

    private prune(): void {
        const now = Date.now();
        for (const [id, dataset] of this.datasets) {
            if (dataset.expiresAtMs <= now) this.datasets.delete(id);
        }
    }

    mint(args: MintDatasetArgs): TdcpDatasetDescriptor {
        this.prune();
        this.counter += 1;
        const datasetId = `ds_${this.counter}`;
        const token = `tok_${globalThis.crypto.randomUUID()}`;
        const expiresAtMs = Date.now() + this.ttlMs;
        this.datasets.set(datasetId, {
            rows: args.rows,
            token,
            expiresAtMs,
        });
        const expiresAt = new Date(expiresAtMs).toISOString();
        return {
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
            ...(args.pushedPredicates
                ? { pushedPredicates: args.pushedPredicates }
                : {}),
        };
    }

    read(datasetId: string, bearerToken: string | null): DataPlaneRead {
        const dataset = this.datasets.get(datasetId);
        if (!dataset || dataset.expiresAtMs <= Date.now()) {
            return { kind: 'notFound' };
        }
        if (bearerToken !== dataset.token) {
            return { kind: 'unauthorized' };
        }
        return { kind: 'ok', rows: dataset.rows };
    }
}
