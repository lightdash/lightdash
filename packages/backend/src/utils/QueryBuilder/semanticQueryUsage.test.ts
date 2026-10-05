import {
    FilterOperator,
    getFilterRules,
    MetricType,
    type MetricQuery,
} from '@lightdash/common';
import {
    EXPLORE,
    METRIC_QUERY,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';
import { QueryComposer } from './QueryComposer';
import {
    buildSemanticQueryUsage,
    MAX_SEMANTIC_REFERENCES,
} from './semanticQueryUsage';

const query: MetricQuery = {
    ...METRIC_QUERY,
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    tableCalculations: [],
    filters: {
        dimensions: {
            id: 'filters',
            and: [
                {
                    id: 'filter',
                    target: { fieldId: 'table1_dim1' },
                    operator: FilterOperator.EQUALS,
                    values: [987654321],
                },
            ],
        },
    },
    sorts: [{ fieldId: 'table1_dim1', descending: false }],
};

const composer = (metricQuery = query, explore = EXPLORE) =>
    new QueryComposer(
        { metricQuery },
        { explore, warehouseSqlBuilder: warehouseClientMock },
    );

describe('Runtime semantic references', () => {
    it('captures distinct field roles, labels and definition hashes without SQL or values', () => {
        const usage = composer().getSemanticUsage();
        expect(usage.status).toBe('captured');
        expect(
            usage.references.map(({ fieldId, role }) => [fieldId, role]),
        ).toEqual([
            ['table1_metric1', 'selected'],
            ['table1_dim1', 'selected'],
            ['table1_dim1', 'group'],
            ['table1_dim1', 'filter'],
            ['table1_dim1', 'sort'],
        ]);
        expect(usage.references[0]).toMatchObject({
            fieldKind: 'metric',
            fieldOrigin: 'model',
            tableName: 'table1',
            definitionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(JSON.stringify(usage)).not.toContain('987654321');
        expect(JSON.stringify(usage)).not.toContain('compiledSql');
    });

    it('resolves filter-only fields and deduplicates repeated filters', () => {
        const rules = getFilterRules(query.filters);
        const filtered = {
            ...query,
            dimensions: [],
            sorts: [],
            filters: {
                dimensions: { id: 'filters', and: [...rules, ...rules] },
            },
        };
        const usage = composer(filtered).getSemanticUsage();
        expect(
            usage.references.filter((r) => r.fieldId === 'table1_dim1'),
        ).toEqual([expect.objectContaining({ role: 'filter' })]);
    });

    it('retains identity across a label rename and versions definition changes', () => {
        const before = composer().getSemanticUsage().references[0];
        const renamed = structuredClone(EXPLORE);
        renamed.tables.table1.metrics.metric1.label = 'A new display name';
        const after = composer(query, renamed).getSemanticUsage().references[0];
        expect(after).toMatchObject({
            fieldId: before.fieldId,
            definitionHash: before.definitionHash,
            fieldLabel: 'A new display name',
        });
        renamed.tables.table1.metrics.metric1.sql = 'different definition';
        expect(
            composer(query, renamed).getSemanticUsage().references[0]
                .definitionHash,
        ).not.toBe(before.definitionHash);
    });

    it('marks ad hoc metrics as custom instead of modeled inventory', () => {
        const usage = composer({
            ...query,
            metrics: ['table1_custom_count'],
            additionalMetrics: [
                {
                    name: 'custom_count',
                    label: 'Custom count',
                    table: 'table1',
                    type: MetricType.COUNT,
                    sql: '1',
                },
            ],
        }).getSemanticUsage();
        expect(usage.references[0]).toMatchObject({
            fieldId: 'table1_custom_count',
            fieldOrigin: 'custom',
            fieldKind: 'metric',
            fieldLabel: 'Custom count',
        });
    });

    it('bounds payload size and reports partial capture', () => {
        const field = EXPLORE.tables.table1.metrics.metric1;
        const ids = Array.from(
            { length: MAX_SEMANTIC_REFERENCES + 10 },
            (_, i) => `field_${i}`,
        );
        const usage = buildSemanticQueryUsage(
            { ...query, metrics: ids },
            EXPLORE,
            Object.fromEntries(ids.map((id) => [id, field])),
        );
        expect(usage.status).toBe('partial');
        expect(usage.references.length).toBeLessThanOrEqual(
            MAX_SEMANTIC_REFERENCES,
        );
        expect(
            Buffer.byteLength(JSON.stringify(usage.references)),
        ).toBeLessThanOrEqual(64 * 1024);
    });

    it('does not fail a query when optional telemetry cannot be built', () => {
        const broken = {
            ...query,
            get filters(): never {
                throw new Error('test');
            },
        };
        expect(buildSemanticQueryUsage(broken, EXPLORE, {})).toEqual({
            status: 'unavailable',
            references: [],
        });
    });
});
