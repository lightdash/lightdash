import { QueryHistoryStatus } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { lightdashApi } from '../api';
import { pollForResults } from '../features/queryRunner/executeQuery';
import { fetchColumnSubtotalRows } from './useAsyncCalculateTotal';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));
vi.mock('../features/queryRunner/executeQuery', () => ({
    pollForResults: vi.fn(),
}));
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: undefined }),
}));
vi.mock('./useProject', () => ({
    useProject: vi.fn(),
}));

const mockApi = lightdashApi as unknown as Mock;
const mockPoll = vi.mocked(pollForResults);

const ARGS = {
    projectUuid: 'project-uuid',
    sourceQueryUuid: 'source-query-uuid',
    subtotalDimensions: ['orders_country'],
};

const row = (country: string, total: string) => ({
    orders_country: { value: { raw: country, formatted: country } },
    orders_total: { value: { raw: total, formatted: `$${total}` } },
});

const polled = (status: QueryHistoryStatus, error?: string) =>
    ({ status, error }) as Awaited<ReturnType<typeof pollForResults>>;

describe('fetchColumnSubtotalRows', () => {
    beforeEach(() => {
        mockApi.mockReset();
        mockPoll.mockReset();
    });

    it('starts a column subtotal and returns every page with formatting intact', async () => {
        mockApi
            .mockResolvedValueOnce({ queryUuid: 'subtotal-query-uuid' })
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.READY,
                rows: [row('Portugal', '10.5')],
                totalPageCount: 2,
            })
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.READY,
                rows: [row('Spain', '7')],
                totalPageCount: 2,
            });
        mockPoll.mockResolvedValue(polled(QueryHistoryStatus.READY));

        await expect(fetchColumnSubtotalRows(ARGS)).resolves.toEqual([
            row('Portugal', '10.5'),
            row('Spain', '7'),
        ]);

        const [start, firstPage, secondPage] = mockApi.mock.calls.map(
            ([request]) => request,
        );
        expect(start).toMatchObject({
            url: '/projects/project-uuid/query/source-query-uuid/calculate-total',
            version: 'v2',
            method: 'POST',
        });
        expect(JSON.parse(String(start.body))).toEqual({
            kind: 'columnSubtotal',
            subtotalDimensions: ['orders_country'],
        });
        expect(mockPoll).toHaveBeenCalledWith(
            'project-uuid',
            'subtotal-query-uuid',
        );
        expect(firstPage.url).toBe(
            '/projects/project-uuid/query/subtotal-query-uuid?page=1',
        );
        expect(secondPage.url).toBe(
            '/projects/project-uuid/query/subtotal-query-uuid?page=2',
        );
    });

    it("rejects with the backend's reason when it refuses the subtotal", async () => {
        const refused = {
            status: 'error',
            error: {
                name: 'NotSupportedError',
                statusCode: 400,
                message: 'Nothing to total',
                data: {},
            },
        };
        mockApi.mockRejectedValueOnce(refused);

        await expect(fetchColumnSubtotalRows(ARGS)).rejects.toBe(refused);
        expect(mockPoll).not.toHaveBeenCalled();
    });

    it('rethrows other start failures', async () => {
        const forbidden = {
            status: 'error',
            error: {
                name: 'ForbiddenError',
                statusCode: 403,
                message: 'Forbidden',
                data: {},
            },
        };
        mockApi.mockRejectedValueOnce(forbidden);

        await expect(fetchColumnSubtotalRows(ARGS)).rejects.toBe(forbidden);
    });

    it('surfaces the query error when the subtotal query fails', async () => {
        mockApi.mockResolvedValueOnce({ queryUuid: 'subtotal-query-uuid' });
        mockPoll.mockResolvedValue(
            polled(QueryHistoryStatus.ERROR, 'Warehouse timeout'),
        );

        await expect(fetchColumnSubtotalRows(ARGS)).rejects.toThrow(
            'Warehouse timeout',
        );
    });

    it('rejects a query that stops in a non-ready status', async () => {
        mockApi.mockResolvedValueOnce({ queryUuid: 'subtotal-query-uuid' });
        mockPoll.mockResolvedValue(polled(QueryHistoryStatus.CANCELLED));

        await expect(fetchColumnSubtotalRows(ARGS)).rejects.toThrow(
            'Unexpected query status while polling subtotals',
        );
    });
});
