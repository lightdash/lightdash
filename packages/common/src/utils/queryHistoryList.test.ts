import { QueryExecutionContext } from '../types/analytics';
import type { ExecuteAsyncQueryRequestParams } from '../types/api/paginatedQuery';
import { DimensionType, FieldType, type ItemsMap } from '../types/field';
import {
    getContextsForTrigger,
    getQueryTrigger,
    QueryLanguage,
    QueryTrigger,
} from '../types/queryHistoryList';
import {
    getQueryLanguage,
    getSemanticQuerySummary,
    getSqlFirstLine,
    getSqlQueryTitle,
} from './queryHistoryList';

describe('query trigger taxonomy', () => {
    it('maps every execution context to exactly one trigger', () => {
        const allContexts = Object.values(QueryExecutionContext);
        const bucketed = Object.values(QueryTrigger).flatMap((trigger) =>
            getContextsForTrigger(trigger),
        );
        expect(bucketed.sort()).toEqual([...allContexts].sort());
    });

    it('classifies the spec examples correctly', () => {
        expect(getQueryTrigger(QueryExecutionContext.EXPLORE)).toBe(
            QueryTrigger.INTERACTIVE,
        );
        // api/cli/ai/mcp fold into interactive — executed by the user.
        expect(getQueryTrigger(QueryExecutionContext.API)).toBe(
            QueryTrigger.INTERACTIVE,
        );
        expect(getQueryTrigger(QueryExecutionContext.MCP_RUN_SQL)).toBe(
            QueryTrigger.INTERACTIVE,
        );
        expect(getQueryTrigger(QueryExecutionContext.DASHBOARD)).toBe(
            QueryTrigger.APPS,
        );
        // Metric cards run themselves on load, not because a person hit run.
        expect(getQueryTrigger(QueryExecutionContext.METRICS_EXPLORER)).toBe(
            QueryTrigger.APPS,
        );
        expect(getQueryTrigger(QueryExecutionContext.EMBED)).toBe(
            QueryTrigger.APPS,
        );
        expect(getQueryTrigger(QueryExecutionContext.SCHEDULED_DELIVERY)).toBe(
            QueryTrigger.SCHEDULED,
        );
    });
});

describe('getQueryLanguage', () => {
    it('detects SQL runner requests', () => {
        expect(
            getQueryLanguage({
                sql: 'select 1',
            } as ExecuteAsyncQueryRequestParams),
        ).toBe(QueryLanguage.SQL);
    });

    it('detects saved sql chart requests', () => {
        expect(
            getQueryLanguage({
                savedSqlUuid: 'uuid',
            } as ExecuteAsyncQueryRequestParams),
        ).toBe(QueryLanguage.SQL);
    });

    it('treats metric queries as semantic', () => {
        expect(
            getQueryLanguage({
                query: {},
            } as unknown as ExecuteAsyncQueryRequestParams),
        ).toBe(QueryLanguage.SEMANTIC);
    });
});

describe('getSqlQueryTitle', () => {
    it('prefers the first CTE name', () => {
        expect(
            getSqlQueryTitle(
                'with cohorts as (select 1)\nselect * from cohorts',
            ),
        ).toBe('cohorts');
    });

    it('falls back to the first FROM target without its schema', () => {
        expect(
            getSqlQueryTitle('select * from analytics.web_sessions where 1=1'),
        ).toBe('web_sessions');
    });

    it('returns null when nothing is recognisable', () => {
        expect(getSqlQueryTitle('show tables')).toBeNull();
    });
});

describe('getSqlFirstLine', () => {
    it('returns the first non-empty trimmed line', () => {
        expect(getSqlFirstLine('\n  select warehouse_id\nfrom x')).toBe(
            'select warehouse_id',
        );
    });
});

describe('getSemanticQuerySummary', () => {
    const fields: ItemsMap = {
        orders_total_revenue: {
            fieldType: FieldType.METRIC,
            type: 'sum',
            name: 'total_revenue',
            label: 'Total revenue',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '',
            hidden: false,
        } as unknown as ItemsMap[string],
        orders_order_date_week: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.DATE,
            name: 'order_date_week',
            label: 'Order date week',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '',
            hidden: false,
        } as unknown as ItemsMap[string],
    };

    it('joins metric and dimension labels', () => {
        expect(
            getSemanticQuerySummary(
                {
                    metrics: ['orders_total_revenue'],
                    dimensions: ['orders_order_date_week'],
                },
                fields,
            ),
        ).toBe('Total revenue · by Order date week');
    });

    it('falls back to friendly field ids when the item is missing', () => {
        expect(
            getSemanticQuerySummary(
                { metrics: ['orders_order_count'], dimensions: [] },
                {},
            ),
        ).toBe('Orders order count');
    });
});
