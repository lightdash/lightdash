import { QueryExecutionContext } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { ProjectModel } from './ProjectModel';

describe('recent non-AI warehouse query selection', () => {
    it('limits the result to this project, caller, non-AI context and 24 hours', async () => {
        const builder = {
            where: vi.fn().mockReturnThis(),
            whereNotNull: vi.fn().mockReturnThis(),
            whereNotIn: vi.fn().mockReturnThis(),
            whereIn: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            first: vi.fn(async () => ({ warehouse_query_id: '01b-query' })),
        };
        const database = vi.fn(() => builder);
        const model = { database } as unknown as ProjectModel;
        const before = Date.now();
        const queryId =
            await ProjectModel.prototype.getRecentNonAiWarehouseQueryId.call(
                model,
                'project',
                'caller',
            );
        const after = Date.now();

        expect(queryId).toBe('01b-query');
        expect(database).toHaveBeenCalledWith('query_history');
        expect(builder.where).toHaveBeenCalledWith('project_uuid', 'project');
        expect(builder.where).toHaveBeenCalledWith(
            'created_by_user_uuid',
            'caller',
        );
        expect(builder.whereNotNull).toHaveBeenCalledWith('warehouse_query_id');
        expect(builder.whereNotIn).toHaveBeenCalledWith(
            'context',
            expect.arrayContaining([
                QueryExecutionContext.AI,
                QueryExecutionContext.MCP_RUN_SQL,
            ]),
        );
        expect(builder.whereNotIn.mock.calls[0]?.[1]).not.toContain(
            QueryExecutionContext.SQL_RUNNER,
        );
        expect(builder.whereIn).toHaveBeenCalledWith(
            'context',
            expect.arrayContaining([
                QueryExecutionContext.DASHBOARD,
                QueryExecutionContext.EXPLORE,
                QueryExecutionContext.SQL_RUNNER,
            ]),
        );
        expect(builder.whereIn.mock.calls[0]?.[1]).not.toContain(
            QueryExecutionContext.AI,
        );
        const cutoff = builder.where.mock.calls.find(
            ([column]) => column === 'created_at',
        )?.[2] as Date;
        expect(cutoff.getTime()).toBeGreaterThanOrEqual(
            before - 24 * 60 * 60 * 1000,
        );
        expect(cutoff.getTime()).toBeLessThanOrEqual(
            after - 24 * 60 * 60 * 1000,
        );
        expect(builder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });
});
