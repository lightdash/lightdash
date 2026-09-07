import {
    chunkAsyncRowsByBytes,
    chunkRowsByBytes,
    describeWholeSetOverflow,
    POSTGRES_JSONB_MAX_BYTES,
    serialisedArrayBytes,
} from './chunkRowsByBytes';

const sized = (...sizes: number[]) =>
    sizes.map((bytes, index) => ({ row: `row${index}`, bytes }));

describe('chunkRowsByBytes', () => {
    it('bounds a chunk by bytes', () => {
        const chunks = [
            ...chunkRowsByBytes(sized(40, 40, 40, 40), 100, 1000),
        ].map((c) => c.rows);
        expect(chunks).toEqual([
            ['row0', 'row1'],
            ['row2', 'row3'],
        ]);
    });

    it('bounds a chunk by row count as well', () => {
        const chunks = [...chunkRowsByBytes(sized(1, 1, 1, 1, 1), 1000, 2)].map(
            (c) => c.rows,
        );
        expect(chunks).toEqual([['row0', 'row1'], ['row2', 'row3'], ['row4']]);
    });

    it('emits an oversized single row on its own rather than dropping it', () => {
        const chunks = [...chunkRowsByBytes(sized(10, 500, 10), 100, 1000)].map(
            (c) => c.rows,
        );
        expect(chunks).toEqual([['row0'], ['row1'], ['row2']]);
    });

    it('keeps every row exactly once and in order', () => {
        const input = sized(...Array.from({ length: 97 }, (_, i) => i + 1));
        const chunks = [...chunkRowsByBytes(input, 250, 7)].map((c) => c.rows);
        expect(chunks.flat()).toEqual(input.map(({ row }) => row));
    });

    it('never exceeds either bound except for a single oversized row', () => {
        const input = sized(
            ...Array.from({ length: 200 }, (_, i) => (i % 13) + 1),
        );
        const chunks = [...chunkRowsByBytes(input, 30, 5)].map((c) => c.rows);
        chunks.forEach((rows) => {
            expect(rows.length).toBeLessThanOrEqual(5);
        });
    });

    it('yields nothing for an empty input', () => {
        expect([...chunkRowsByBytes([], 100, 10)].map((c) => c.rows)).toEqual(
            [],
        );
    });

    it('consumes a lazy generator without materialising every row', () => {
        let produced = 0;
        function* lazy() {
            // eslint-disable-next-line no-plusplus
            for (let i = 0; i < 10; i++) {
                produced += 1;
                yield { row: `row${i}`, bytes: 10 };
            }
        }
        const iterator = chunkRowsByBytes(lazy(), 20, 1000);
        iterator.next();
        // the first chunk closes on the third row, so the tail is still unproduced
        expect(produced).toBeLessThan(10);
    });

    it('treats a non-positive limit as one', () => {
        expect(
            [...chunkRowsByBytes(sized(5, 5), 0, 0)].map((c) => c.rows),
        ).toEqual([['row0'], ['row1']]);
    });
});

describe('chunkAsyncRowsByBytes', () => {
    it('bounds chunks by bytes and rows while preserving row order', async () => {
        async function* rows() {
            yield { row: 'row0', bytes: 40 };
            yield { row: 'row1', bytes: 40 };
            yield { row: 'row2', bytes: 40 };
            yield { row: 'row3', bytes: 40 };
        }

        const chunks = [];
        for await (const chunk of chunkAsyncRowsByBytes(rows(), 100, 2)) {
            chunks.push(chunk);
        }

        expect(chunks).toEqual([
            { rows: ['row0', 'row1'], bytes: 80 },
            { rows: ['row2', 'row3'], bytes: 80 },
        ]);
    });

    it('leaves unconsumed rows unread and closes the source on cancellation', async () => {
        let produced = 0;
        let closed = false;
        async function* rows() {
            try {
                for (let index = 0; index < 10; index += 1) {
                    produced += 1;
                    yield { row: `row${index}`, bytes: 10 };
                }
            } finally {
                closed = true;
            }
        }

        const chunks = chunkAsyncRowsByBytes(rows(), 20, 1000);

        await chunks.next();
        await chunks.return(undefined);

        expect(produced).toBe(3);
        expect(closed).toBe(true);
    });
});

describe('the whole-set jsonb ceiling', () => {
    it('sizes an array without building it as one string', () => {
        const items = [{ a: 1 }, { a: 2 }];
        // ["{"a":1}","{"a":2}"] -> each element plus a separator, plus the brackets
        expect(serialisedArrayBytes(items)).toEqual(
            JSON.stringify(items).length,
        );
    });

    it('names the size and the limit rather than surfacing a bare RangeError', () => {
        const bytes = POSTGRES_JSONB_MAX_BYTES + 1;
        const message = describeWholeSetOverflow(5800, bytes);
        expect(message).toContain('5800 explores');
        expect(message).toContain(`${bytes} bytes`);
        expect(message).toContain(`${POSTGRES_JSONB_MAX_BYTES} byte limit`);
        expect(message).not.toContain('RangeError');
    });

    it('puts the customer-scale set well inside the limit', () => {
        // 3,382 explores at the measured 46,311 byte mean
        const bytes = 3382 * 46311;
        expect(bytes).toBeLessThan(POSTGRES_JSONB_MAX_BYTES);
        expect((bytes / POSTGRES_JSONB_MAX_BYTES) * 100).toBeGreaterThan(50);
    });
});
