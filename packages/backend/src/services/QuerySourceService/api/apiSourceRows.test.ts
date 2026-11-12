import { ParameterError } from '@lightdash/common';
import { readRowsWithinCap } from './apiSourceRows';

const rowsOf = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ index }));

/** An API with `total` rows, handing them out by offset. */
const pagedApi = (total: number) =>
    vi.fn(
        async ({
            limit,
            cursor,
        }: {
            limit: number;
            cursor: string | undefined;
        }) => {
            const start = Number(cursor ?? 0);
            const end = Math.min(start + limit, total);
            return {
                rows: rowsOf(end - start),
                ...(end < total ? { nextCursor: String(end) } : {}),
            };
        },
    );

const limits = { label: 'Source', pageSize: 100, maxPages: 3, maxRows: 300 };

describe('readRowsWithinCap', () => {
    it('returns everything when the API has fewer rows than asked for', async () => {
        const fetchPage = pagedApi(150);
        const result = await readRowsWithinCap({
            ...limits,
            requestedRows: 200,
            fetchPage,
        });
        expect(result.rows).toHaveLength(150);
        expect(result.hasMoreRows).toBe(false);
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('marks a result the requested limit cut off', async () => {
        const fetchPage = pagedApi(1_000);
        const result = await readRowsWithinCap({
            ...limits,
            requestedRows: 150,
            fetchPage,
        });
        expect(result.rows).toHaveLength(150);
        expect(result.hasMoreRows).toBe(true);
        expect(fetchPage).toHaveBeenLastCalledWith({
            limit: 51,
            cursor: '100',
        });
    });

    it('refuses when the pages run out before the end', async () => {
        await expect(
            readRowsWithinCap({
                ...limits,
                requestedRows: 300,
                fetchPage: pagedApi(1_000),
            }),
        ).rejects.toThrow(
            new ParameterError(
                'Source has more rows than the 300 one query can read, so this result would be incomplete. Narrow the date range, add a filter or remove a dimension.',
            ),
        );
    });

    it('refuses a request past the cap once the cap is passed', async () => {
        await expect(
            readRowsWithinCap({
                label: 'Source',
                pageSize: 301,
                maxPages: 1,
                maxRows: 300,
                requestedRows: 500,
                fetchPage: pagedApi(1_000),
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('allows a request past the cap when the rows fit', async () => {
        const result = await readRowsWithinCap({
            label: 'Source',
            pageSize: 301,
            maxPages: 1,
            maxRows: 300,
            requestedRows: 500,
            fetchPage: pagedApi(300),
        });
        expect(result.rows).toHaveLength(300);
        expect(result.hasMoreRows).toBe(false);
    });
});
