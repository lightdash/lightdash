import {
    type PivotChartData,
    type RunPivotQuery,
    type SqlRunnerQuery,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchQuery, invalidateQueries } = vi.hoisted(() => ({
    fetchQuery: vi.fn(),
    invalidateQueries: vi.fn(),
}));

vi.mock('../../providers/ReactQuery/createQueryClient', () => ({
    createQueryClient: () => ({ fetchQuery, invalidateQueries }),
}));

import { BaseResultsRunner } from './BaseResultsRunner';

const emptyPivotChartData: PivotChartData = {
    queryUuid: undefined,
    fileUrl: undefined,
    results: [],
    indexColumn: undefined,
    valuesColumns: [],
    columns: [],
    columnCount: undefined,
};

describe('BaseResultsRunner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchQuery.mockResolvedValue(emptyPivotChartData);
    });

    it('uses the connection UUID in transformed-result cache keys', async () => {
        const query = {} as SqlRunnerQuery;
        const runPivotQuery = vi.fn() as unknown as RunPivotQuery;
        const runnerA = new BaseResultsRunner({
            fields: [],
            rows: [],
            columnNames: [],
            connectionUuid: 'connection-a',
            runPivotQuery,
        });
        const runnerB = new BaseResultsRunner({
            fields: [],
            rows: [],
            columnNames: [],
            connectionUuid: 'connection-b',
            runPivotQuery,
        });

        await runnerA.getPivotedVisualizationData(query);
        await runnerB.getPivotedVisualizationData(query);

        expect(fetchQuery.mock.calls[0]?.[0].queryKey).toEqual([
            'transformedData',
            'connection-a',
            query,
        ]);
        expect(fetchQuery.mock.calls[1]?.[0].queryKey).toEqual([
            'transformedData',
            'connection-b',
            query,
        ]);
    });
});
