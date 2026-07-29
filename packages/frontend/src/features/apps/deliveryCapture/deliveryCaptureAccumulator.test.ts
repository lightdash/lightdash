import {
    CAPTURE_KEY_VERSION,
    MAX_CAPTURE_LABEL_CHARS,
    MAX_DELIVERY_QUERIES,
    parseDeliveryCaptureManifest,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createDeliveryCaptureAccumulator,
    type DeliveryCaptureAccumulator,
} from './deliveryCaptureAccumulator';

const METRIC_PATH = '/api/v2/projects/proj/query/metric-query';
const CHART_PATH = '/api/v2/projects/proj/query/chart';

const baseMetricQuery = (overrides: Record<string, unknown> = {}) => ({
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    ...overrides,
});

/** Drives an entry through onPostResponse + onTerminal(ready) in one call. */
function completeReady(
    acc: DeliveryCaptureAccumulator,
    requestId: string,
    queryUuid: string,
    rowCount: number | null,
    metricQuery?: { exploreName?: string; limit?: number },
) {
    acc.onPostResponse(requestId, { queryUuid, metricQuery });
    acc.onTerminal(queryUuid, { status: 'ready', rowCount });
}

describe('deliveryCaptureAccumulator', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('metric-query happy path produces a ready item with rowCount', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery({ limit: 100 }) },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 42);

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0]).toMatchObject({
            status: 'ready',
            exploreName: 'orders',
            queryUuid: 'u1',
            rowCount: 42,
            label: 'orders',
            order: 0,
        });
        expect(parseDeliveryCaptureManifest(manifest)).not.toBeNull();
    });

    it('captureKey is v1:<sha256 hex> over method+path+stripped-body', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'post',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 1);

        const manifest = await acc.getManifest();
        expect(manifest.items[0].captureKey).toMatch(
            new RegExp(`^${CAPTURE_KEY_VERSION}:[0-9a-f]{64}$`),
        );
    });

    it('chart-query gets exploreName/limit only after onPostResponse', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: CHART_PATH,
            body: { chartUuid: 'chart-1' },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 7, {
            exploreName: 'customers',
            limit: 50,
        });

        const manifest = await acc.getManifest();
        expect(manifest.items[0]).toMatchObject({
            exploreName: 'customers',
            label: 'customers',
            limitReached: false,
        });
    });

    it('two identical payloads collapse to one item with the later requestId', async () => {
        const acc = createDeliveryCaptureAccumulator();
        const body = { query: baseMetricQuery() };
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body,
            label: null,
        });
        acc.onInitiation({
            requestId: 'r2',
            method: 'POST',
            path: METRIC_PATH,
            body,
            label: null,
        });
        completeReady(acc, 'r2', 'u2', 5);

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0].queryUuid).toBe('u2');
    });

    it('field-order-permuted bodies hash identically (collapse to one item)', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: {
                query: {
                    exploreName: 'orders',
                    dimensions: ['a'],
                    metrics: ['b'],
                },
            },
            label: null,
        });
        acc.onInitiation({
            requestId: 'r2',
            method: 'POST',
            path: METRIC_PATH,
            body: {
                query: {
                    metrics: ['b'],
                    dimensions: ['a'],
                    exploreName: 'orders',
                },
            },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 1);
        completeReady(acc, 'r2', 'u2', 2);

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0].queryUuid).toBe('u2');
    });

    it('a body with invalidateCache: true hashes identically to one without', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: null,
        });
        acc.onInitiation({
            requestId: 'r2',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery(), invalidateCache: true },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 1);
        completeReady(acc, 'r2', 'u2', 2);

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0].queryUuid).toBe('u2');
    });

    it('a body with context/dashboardFilters stamped hashes identically to one without', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: null,
        });
        acc.onInitiation({
            requestId: 'r2',
            method: 'POST',
            path: METRIC_PATH,
            body: {
                query: baseMetricQuery(),
                context: 'scheduledDelivery',
                dashboardFilters: { dimensions: [], metrics: [] },
            },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 1);
        completeReady(acc, 'r2', 'u2', 2);

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0].queryUuid).toBe('u2');
    });

    it('order is assigned synchronously in onInitiation, independent of hash resolution order', async () => {
        // Mock digest so the SECOND initiation's hash resolves before the FIRST's,
        // and confirm capture order still reflects call order, not resolution order.
        const resolvers: Array<(value: ArrayBuffer) => void> = [];
        const digestSpy = vi
            .spyOn(globalThis.crypto.subtle, 'digest')
            .mockImplementation(
                () =>
                    new Promise<ArrayBuffer>((resolve) => {
                        resolvers.push(resolve);
                    }),
            );

        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'first',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery({ dimensions: ['x'] }) },
            label: null,
        });
        acc.onInitiation({
            requestId: 'second',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery({ dimensions: ['y'] }) },
            label: null,
        });

        expect(resolvers).toHaveLength(2);
        // Resolve out of call order: second's digest settles first.
        const fakeDigest = (byte: number) => {
            const buf = new Uint8Array(32).fill(byte);
            return buf.buffer;
        };
        resolvers[1](fakeDigest(2));
        resolvers[0](fakeDigest(1));

        acc.onPostResponse('first', { queryUuid: 'u-first' });
        acc.onPostResponse('second', { queryUuid: 'u-second' });
        acc.onTerminal('u-first', { status: 'ready', rowCount: 1 });
        acc.onTerminal('u-second', { status: 'ready', rowCount: 2 });

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(2);
        const first = manifest.items.find((i) => i.queryUuid === 'u-first');
        const second = manifest.items.find((i) => i.queryUuid === 'u-second');
        expect(first?.order).toBe(0);
        expect(second?.order).toBe(1);

        digestSpy.mockRestore();
    });

    it('same captureKey re-initiated keeps original order; a response for the superseded requestId is ignored', async () => {
        const acc = createDeliveryCaptureAccumulator();
        const body = { query: baseMetricQuery() };
        acc.onInitiation({
            requestId: 'A',
            method: 'POST',
            path: METRIC_PATH,
            body,
            label: null,
        });
        acc.onInitiation({
            requestId: 'B',
            method: 'POST',
            path: METRIC_PATH,
            body,
            label: null,
        });

        // Superseded requestId's late response must not resurrect/affect the entry.
        acc.onPostResponse('A', { queryUuid: 'u-A' });
        acc.onTerminal('u-A', { status: 'ready', rowCount: 999 });

        completeReady(acc, 'B', 'u-B', 10);

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0]).toMatchObject({
            queryUuid: 'u-B',
            rowCount: 10,
            order: 0,
        });
    });

    it('distinct captureKeys with the same label get (2), (3) suffixes in capture order', async () => {
        const acc = createDeliveryCaptureAccumulator();
        ['a', 'b', 'c'].forEach((dim, i) => {
            acc.onInitiation({
                requestId: `r${i}`,
                method: 'POST',
                path: METRIC_PATH,
                body: { query: baseMetricQuery({ dimensions: [dim] }) },
                label: 'My Query',
            });
        });
        completeReady(acc, 'r0', 'u0', 1);
        completeReady(acc, 'r1', 'u1', 2);
        completeReady(acc, 'r2', 'u2', 3);

        const manifest = await acc.getManifest();
        expect(manifest.items.map((i) => i.label)).toEqual([
            'My Query',
            'My Query (2)',
            'My Query (3)',
        ]);
    });

    it('label resolution: metadata.label wins over exploreName and the Query N fallback', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: 'Custom label',
        });
        completeReady(acc, 'r1', 'u1', 1);

        const manifest = await acc.getManifest();
        expect(manifest.items[0].label).toBe('Custom label');
    });

    it('label resolution falls back to `Query ${order + 1}` when there is no label or exploreName', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: CHART_PATH,
            body: { chartUuid: 'chart-1' },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 1, {});

        const manifest = await acc.getManifest();
        expect(manifest.items[0].label).toBe('Query 1');
    });

    it('truncates labels to MAX_CAPTURE_LABEL_CHARS', async () => {
        const acc = createDeliveryCaptureAccumulator();
        const longLabel = 'x'.repeat(MAX_CAPTURE_LABEL_CHARS + 50);
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: longLabel,
        });
        completeReady(acc, 'r1', 'u1', 1);

        const manifest = await acc.getManifest();
        expect(manifest.items[0].label.length).toBeLessThanOrEqual(
            MAX_CAPTURE_LABEL_CHARS,
        );
        expect(parseDeliveryCaptureManifest(manifest)).not.toBeNull();
    });

    it('limitReached is true when rowCount >= limit, computed in onTerminal', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery({ limit: 10 }) },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 10);

        const manifest = await acc.getManifest();
        expect(manifest.items[0]).toMatchObject({
            status: 'ready',
            limitReached: true,
        });
    });

    it('limitReached is false when rowCount < limit', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery({ limit: 10 }) },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', 3);

        const manifest = await acc.getManifest();
        expect(manifest.items[0]).toMatchObject({ limitReached: false });
    });

    it('limitReached is false when rowCount is null', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery({ limit: 10 }) },
            label: null,
        });
        completeReady(acc, 'r1', 'u1', null);

        const manifest = await acc.getManifest();
        expect(manifest.items[0]).toMatchObject({ limitReached: false });
    });

    it('onPostFailure before a uuid is assigned produces an error item with queryUuid: null', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: null,
        });
        acc.onPostFailure('r1', 'Warehouse timeout');

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0]).toMatchObject({
            status: 'error',
            queryUuid: null,
            error: 'Warehouse timeout',
        });
        expect(parseDeliveryCaptureManifest(manifest)).not.toBeNull();
    });

    it('drops initiations beyond MAX_DELIVERY_QUERIES distinct keys and counts them in overflowCount', async () => {
        const acc = createDeliveryCaptureAccumulator();
        const total = MAX_DELIVERY_QUERIES + 3;
        for (let i = 0; i < total; i += 1) {
            acc.onInitiation({
                requestId: `r${i}`,
                method: 'POST',
                path: METRIC_PATH,
                body: { query: baseMetricQuery({ dimensions: [`d${i}`] }) },
                label: null,
            });
        }

        const manifest = await acc.getManifest();
        expect(manifest.overflowCount).toBe(3);
    });

    it('reset() clears all state so a late onPostResponse/onTerminal for a pre-reset id is dropped', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: null,
        });

        acc.reset();

        // Late signals referencing pre-reset ids must find nothing.
        acc.onPostResponse('r1', { queryUuid: 'u1' });
        acc.onTerminal('u1', { status: 'ready', rowCount: 1 });
        acc.onPostFailure('r1', 'too late');

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(0);
        expect(manifest.overflowCount).toBe(0);
    });

    it('an initiated-but-never-responded entry surfaces as an error item with queryUuid null (partial capture must never look complete)', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: null,
        });
        // No onPostResponse/onTerminal — the POST never resolved.

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0]).toMatchObject({
            status: 'error',
            queryUuid: null,
            error: 'Query did not settle before capture completed',
        });
        expect(parseDeliveryCaptureManifest(manifest)).not.toBeNull();
    });

    it('a responded-but-never-polled-terminal entry surfaces as an error item carrying the uuid', async () => {
        const acc = createDeliveryCaptureAccumulator();
        acc.onInitiation({
            requestId: 'r1',
            method: 'POST',
            path: METRIC_PATH,
            body: { query: baseMetricQuery() },
            label: null,
        });
        acc.onPostResponse('r1', { queryUuid: 'u1' });
        // No onTerminal call — the poll never reached ready/error.

        const manifest = await acc.getManifest();
        expect(manifest.items).toHaveLength(1);
        expect(manifest.items[0]).toMatchObject({
            status: 'error',
            queryUuid: 'u1',
            error: 'Query did not settle before capture completed',
        });
        expect(parseDeliveryCaptureManifest(manifest)).not.toBeNull();
    });
});
