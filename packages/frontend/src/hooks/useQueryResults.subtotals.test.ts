import { QueryHistoryStatus } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { pollForResults } from '../features/queryRunner/executeQuery';
import {
    collectSubtotalRows,
    executeQueryAndWaitForResults,
} from './useQueryResults';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../features/queryRunner/executeQuery', () => ({
    pollForResults: vi.fn(),
}));

describe('subtotal query startup', () => {
    const subtotalLevel = {
        subtotalDimensions: ['orders_country'],
        parent: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({
            queryUuid: 'root-query',
        } as never);
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.READY,
            queryUuid: 'root-query',
            rows: [],
            nextPage: undefined,
        } as never);
    });

    it('starts a saved chart with its pin, parameters, and root subtotal level', async () => {
        await executeQueryAndWaitForResults({
            projectUuid: 'project-1',
            tableId: 'orders',
            chartUuid: 'chart-1',
            chartVersionUuid: 'version-1',
            parameters: { region: 'EU' },
            subtotalLevel,
        });
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-1/query/chart',
                method: 'POST',
                body: expect.stringContaining(
                    '"subtotalLevel":{"subtotalDimensions":["orders_country"],"parent":[]}',
                ),
            }),
        );
        const body = JSON.parse(
            vi.mocked(lightdashApi).mock.calls[0][0].body as string,
        );
        expect(body).toMatchObject({
            chartUuid: 'chart-1',
            versionUuid: 'version-1',
            parameters: { region: 'EU' },
            subtotalLevel,
        });
    });

    it('starts an ad-hoc explore with its original filters and root subtotal level', async () => {
        await executeQueryAndWaitForResults({
            projectUuid: 'project-1',
            tableId: 'orders',
            query: {
                exploreName: 'orders',
                dimensions: ['orders_country', 'orders_city'],
                metrics: ['orders_amount'],
                filters: {},
                sorts: [],
                tableCalculations: [],
                limit: 100,
            },
            subtotalLevel,
        });
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-1/query/metric-query',
                method: 'POST',
            }),
        );
        const body = JSON.parse(
            vi.mocked(lightdashApi).mock.calls[0][0].body as string,
        );
        expect(body).toMatchObject({
            query: { exploreName: 'orders', metrics: ['orders_amount'] },
            subtotalLevel,
        });
    });

    it('collects every page of a child subtotal response', async () => {
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            status: QueryHistoryStatus.READY,
            queryUuid: 'child-query',
            rows: [
                {
                    orders_city: {
                        value: { raw: 'Lisbon', formatted: 'Lisbon' },
                    },
                },
            ],
            nextPage: undefined,
        } as never);
        const rows = await collectSubtotalRows('project-1', {
            status: QueryHistoryStatus.READY,
            queryUuid: 'child-query',
            rows: [
                {
                    orders_city: {
                        value: { raw: 'Porto', formatted: 'Porto' },
                    },
                },
            ],
            nextPage: 2,
        } as never);
        expect(rows).toHaveLength(2);
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-1/query/child-query?page=2',
                method: 'GET',
            }),
        );
    });
});
