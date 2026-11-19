import { QueryExecutionContext, WarehouseTypes } from '@lightdash/common';
import {
    buildQueryCostEstimateAgentRefusedEvent,
    buildQueryCostEstimateCompletedEvent,
    getInteractiveQueryCostEstimateSource,
    getQueryCostEstimateLogMeta,
    unavailableInteractiveEstimateRecord,
} from './queryCostEstimateTelemetry';

const base = {
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    warehouseType: WarehouseTypes.BIGQUERY,
};

describe('query cost estimate telemetry', () => {
    it('maps query contexts to interactive sources', () => {
        expect(
            getInteractiveQueryCostEstimateSource(
                QueryExecutionContext.SQL_RUNNER,
            ),
        ).toBe('sql_runner');
        expect(
            getInteractiveQueryCostEstimateSource(
                QueryExecutionContext.EXPLORE,
            ),
        ).toBe('explorer');
    });

    it('builds a completed event that reports a required confirmation', () => {
        expect(
            buildQueryCostEstimateCompletedEvent({
                ...base,
                source: 'explorer',
                outcome: 'ok',
                cache: 'hit',
                dryRunDurationMs: null,
                estimatedBytes: 2_000,
                thresholdBytes: 1_000,
                requiresConfirmation: true,
                error: null,
            }),
        ).toEqual({
            event: 'query_cost_estimate.completed',
            properties: {
                organizationId: 'org-uuid',
                projectId: 'project-uuid',
                source: 'explorer',
                outcome: 'ok',
                estimatedBytes: 2_000,
                confirmEstimatedBytesAbove: 1_000,
                requiresConfirmation: true,
                cacheHit: true,
                dryRunDurationMs: null,
                warehouseType: WarehouseTypes.BIGQUERY,
            },
        });
    });

    it('reports no cache result for an unavailable estimate', () => {
        const record = unavailableInteractiveEstimateRecord({
            ...base,
            source: 'sql_runner',
            thresholdBytes: null,
        });
        expect(buildQueryCostEstimateCompletedEvent(record).properties).toEqual(
            expect.objectContaining({
                outcome: 'unavailable',
                cacheHit: null,
                estimatedBytes: null,
                requiresConfirmation: null,
            }),
        );
    });

    it('builds the agent refusal event', () => {
        expect(
            buildQueryCostEstimateAgentRefusedEvent({
                organizationUuid: 'org-uuid',
                projectUuid: 'project-uuid',
                queryContext: QueryExecutionContext.MCP_RUN_SQL,
                queryUuid: 'query-uuid',
                estimatedBytes: 2_000,
                limitBytes: 1_000,
                cacheHit: false,
                warehouseType: WarehouseTypes.BIGQUERY,
            }),
        ).toEqual({
            event: 'query_cost_estimate.agent_refused',
            properties: {
                organizationId: 'org-uuid',
                projectId: 'project-uuid',
                queryContext: QueryExecutionContext.MCP_RUN_SQL,
                queryUuid: 'query-uuid',
                estimatedBytes: 2_000,
                limitBytes: 1_000,
                cacheHit: false,
                warehouseType: WarehouseTypes.BIGQUERY,
            },
        });
    });

    it('logs only the error name and status code for failures', () => {
        const error = new Error('Table customer_table not found');
        const meta = getQueryCostEstimateLogMeta({
            ...base,
            source: 'explorer',
            outcome: 'error',
            cache: 'miss',
            dryRunDurationMs: 12,
            estimatedBytes: null,
            thresholdBytes: null,
            requiresConfirmation: null,
            error,
        });
        expect(meta).toEqual(
            expect.objectContaining({
                errorName: 'Error',
                errorStatusCode: null,
            }),
        );
        expect(JSON.stringify(meta)).not.toContain('customer_table');
    });
});
