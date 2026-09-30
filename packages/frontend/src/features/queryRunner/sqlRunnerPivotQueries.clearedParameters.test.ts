import { describe, expect, it, vi } from 'vitest';
import {
    executeDashboardSqlChartPivotQuery,
    executeEmbedDashboardSqlChartPivotQuery,
} from './executeQuery';
import {
    getDashboardSqlChartPivotChartData,
    getEmbedDashboardSqlChartPivotChartData,
} from './sqlRunnerPivotQueries';

vi.mock('./executeQuery', () => ({
    executeDashboardSqlChartPivotQuery: vi
        .fn()
        .mockResolvedValue({ columns: {} }),
    executeEmbedDashboardSqlChartPivotQuery: vi
        .fn()
        .mockResolvedValue({ columns: {} }),
    executeSqlChartPivotQuery: vi.fn(),
    executeSqlPivotQuery: vi.fn(),
}));

describe('dashboard SQL parameter clears', () => {
    const args = {
        projectUuid: 'project',
        tileUuid: 'tile',
        dashboardFilters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        dashboardSorts: [],
        parameters: {},
        clearedParameters: ['status'],
        limit: 100,
    };
    it('forwards clears to registered dashboard queries and downloads', async () => {
        await getDashboardSqlChartPivotChartData({
            ...args,
            dashboardUuid: 'dashboard',
            savedSqlUuid: 'chart',
        });
        expect(executeDashboardSqlChartPivotQuery).toHaveBeenCalledWith(
            'project',
            expect.objectContaining({
                parameters: {},
                clearedParameters: ['status'],
                limit: 100,
            }),
        );
    });
    it('forwards clears to embedded dashboard queries and downloads', async () => {
        await getEmbedDashboardSqlChartPivotChartData(args);
        expect(executeEmbedDashboardSqlChartPivotQuery).toHaveBeenCalledWith(
            'project',
            expect.objectContaining({
                parameters: {},
                clearedParameters: ['status'],
                limit: 100,
            }),
        );
    });
});
