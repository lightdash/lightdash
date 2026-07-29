import {
    MAX_CAPTURE_LABEL_CHARS,
    MAX_DELIVERY_QUERIES,
    parseDeliveryCaptureManifest,
    type CapturedQuery,
    type DeliveryCaptureManifest,
} from './deliveryCapture';

const readyItem: CapturedQuery = {
    status: 'ready',
    captureKey: 'v1:abc123',
    label: 'Revenue by month',
    exploreName: 'orders',
    queryUuid: 'query-uuid-1',
    order: 0,
    rowCount: 42,
    limitReached: false,
};

const errorItem: CapturedQuery = {
    status: 'error',
    captureKey: 'v1:def456',
    label: 'Broken query',
    exploreName: null,
    queryUuid: null,
    order: 1,
    error: 'Query failed',
};

const validManifest: DeliveryCaptureManifest = {
    version: 1,
    items: [readyItem, errorItem],
    overflowCount: 0,
};

describe('parseDeliveryCaptureManifest', () => {
    it('round-trips a valid manifest', () => {
        expect(parseDeliveryCaptureManifest(validManifest)).toEqual(
            validManifest,
        );
    });

    it('accepts an empty items array with overflowCount 0 (zero-queries is a job-level decision, not a shape error)', () => {
        const manifest: DeliveryCaptureManifest = {
            version: 1,
            items: [],
            overflowCount: 0,
        };
        expect(parseDeliveryCaptureManifest(manifest)).toEqual(manifest);
    });

    it('rejects non-object values', () => {
        expect(parseDeliveryCaptureManifest(null)).toBeNull();
        expect(parseDeliveryCaptureManifest(undefined)).toBeNull();
        expect(parseDeliveryCaptureManifest('manifest')).toBeNull();
        expect(parseDeliveryCaptureManifest(42)).toBeNull();
        expect(parseDeliveryCaptureManifest([])).toBeNull();
    });

    it('rejects version !== 1', () => {
        expect(
            parseDeliveryCaptureManifest({ ...validManifest, version: 2 }),
        ).toBeNull();
        expect(
            parseDeliveryCaptureManifest({ ...validManifest, version: '1' }),
        ).toBeNull();
        expect(
            parseDeliveryCaptureManifest({
                items: [],
                overflowCount: 0,
            }),
        ).toBeNull();
    });

    it('rejects items that is not an array', () => {
        expect(
            parseDeliveryCaptureManifest({ ...validManifest, items: {} }),
        ).toBeNull();
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: 'nope',
            }),
        ).toBeNull();
    });

    it('rejects more than MAX_DELIVERY_QUERIES items', () => {
        const items = Array.from(
            { length: MAX_DELIVERY_QUERIES + 1 },
            (_, i) => ({
                ...readyItem,
                captureKey: `v1:${i}`,
                order: i,
            }),
        );
        expect(
            parseDeliveryCaptureManifest({ ...validManifest, items }),
        ).toBeNull();
    });

    it('accepts exactly MAX_DELIVERY_QUERIES items', () => {
        const items = Array.from({ length: MAX_DELIVERY_QUERIES }, (_, i) => ({
            ...readyItem,
            captureKey: `v1:${i}`,
            order: i,
        }));
        expect(
            parseDeliveryCaptureManifest({ ...validManifest, items }),
        ).not.toBeNull();
    });

    it('rejects an item with an unknown status', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [{ ...readyItem, status: 'pending' }],
            }),
        ).toBeNull();
    });

    it('rejects a ready item with a non-string queryUuid', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [{ ...readyItem, queryUuid: null }],
            }),
        ).toBeNull();
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [{ ...readyItem, queryUuid: 123 }],
            }),
        ).toBeNull();
    });

    it('rejects an error item with a non-null, non-string queryUuid', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [{ ...errorItem, queryUuid: 123 }],
            }),
        ).toBeNull();
    });

    it('accepts an error item with a string queryUuid', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [{ ...errorItem, queryUuid: 'query-uuid-2' }],
            }),
        ).not.toBeNull();
    });

    it('rejects an item missing captureKey', () => {
        const { captureKey, ...rest } = readyItem;
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [rest],
            }),
        ).toBeNull();
    });

    it('rejects an item missing label', () => {
        const { label, ...rest } = readyItem;
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [rest],
            }),
        ).toBeNull();
    });

    it('rejects a non-number order', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [{ ...readyItem, order: '0' }],
            }),
        ).toBeNull();
    });

    it('rejects a non-number overflowCount', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                overflowCount: '0',
            }),
        ).toBeNull();
    });

    it('rejects a negative overflowCount', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                overflowCount: -1,
            }),
        ).toBeNull();
    });

    // typeof NaN === 'number' and typeof Infinity === 'number', so a bare
    // typeof check lets these through a boundary meant to be fail-closed.
    it('rejects NaN, Infinity and -Infinity for order', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(
                parseDeliveryCaptureManifest({
                    ...validManifest,
                    items: [{ ...readyItem, order: bad }],
                }),
            ).toBeNull();
        }
    });

    it('rejects NaN, Infinity and -Infinity for rowCount', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(
                parseDeliveryCaptureManifest({
                    ...validManifest,
                    items: [{ ...readyItem, rowCount: bad }],
                }),
            ).toBeNull();
        }
    });

    it('rejects NaN, Infinity and -Infinity for overflowCount', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            expect(
                parseDeliveryCaptureManifest({
                    ...validManifest,
                    overflowCount: bad,
                }),
            ).toBeNull();
        }
    });

    it('rejects items array elements that are not plain objects', () => {
        for (const bad of [null, 'x', 42, ['nested']]) {
            expect(
                parseDeliveryCaptureManifest({
                    ...validManifest,
                    items: [bad],
                }),
            ).toBeNull();
        }
    });

    it('is unaffected by a `__proto__`-shaped payload and does not pollute Object.prototype', () => {
        // JSON.parse creates a literal own property named "__proto__" (unlike
        // an object literal, where that key sets the prototype instead) — the
        // realistic shape an untrusted page.evaluate() payload could take.
        const malicious = JSON.parse(
            '{"version":1,"items":[],"overflowCount":0,"__proto__":{"polluted":true}}',
        ) as unknown;
        expect(parseDeliveryCaptureManifest(malicious)).toEqual({
            version: 1,
            items: [],
            overflowCount: 0,
        });
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('rejects a label longer than MAX_CAPTURE_LABEL_CHARS', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [
                    {
                        ...readyItem,
                        label: 'x'.repeat(MAX_CAPTURE_LABEL_CHARS + 1),
                    },
                ],
            }),
        ).toBeNull();
    });

    it('accepts a label exactly MAX_CAPTURE_LABEL_CHARS long', () => {
        expect(
            parseDeliveryCaptureManifest({
                ...validManifest,
                items: [
                    {
                        ...readyItem,
                        label: 'x'.repeat(MAX_CAPTURE_LABEL_CHARS),
                    },
                ],
            }),
        ).not.toBeNull();
    });
});
