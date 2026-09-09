import { parse } from 'yaml';
import { compileLightdashModels } from '../compiler/compileLightdashModels';
import { warehouseClientMock } from '../compiler/exploreCompiler.mock';
import { isExploreError } from '../types/explore';
import { MetricType } from '../types/field';
import { FilterOperator } from '../types/filter';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import { type AdditionalMetric } from '../types/metricQuery';
import { LightdashModelEditor } from './LightdashModelEditor';

const source = `# Keep this model comment
type: model
name: orders
sql_from: public.orders
metrics:
  existing_count: # Keep this metric comment
    type: count
    sql: '1'
dimensions:
  - name: amount
    type: number
    sql: \${TABLE}.amount * 2 # Keep the original expression
  - name: status
    type: string
    sql: \${TABLE}.status
`;
const metric: AdditionalMetric = {
    name: 'paid_revenue',
    label: 'Paid Revenue',
    description: 'Revenue for paid orders',
    table: 'orders',
    baseDimensionName: 'amount',
    sql: '${TABLE}.amount * 2',
    type: MetricType.SUM,
    filters: [
        {
            id: 'paid',
            target: { fieldRef: 'orders.status' },
            operator: FilterOperator.EQUALS,
            values: ['paid'],
        },
    ],
};

describe('native model write-back', () => {
    it('preserves existing YAML and compiles the metric with its SQL, filters and base dimension identity', async () => {
        const output = new LightdashModelEditor(
            source,
            'models/nested/sales.yaml',
        )
            .addCustomMetrics([metric])
            .toString();
        expect(output.split('dimensions:')[0]).toBe(
            source.split('dimensions:')[0],
        );
        expect(output).toContain('# Keep this model comment');
        expect(output).toContain('# Keep this metric comment');
        expect(output).toContain('# Keep the original expression');
        const original = parse(source);
        const updated = parse(output);
        expect(updated.metrics).toEqual(original.metrics);
        expect(updated.dimensions[1]).toEqual(original.dimensions[1]);
        expect(updated).not.toHaveProperty('models');
        const [explore] = await compileLightdashModels({
            models: [{ ...updated, sourcePath: 'models/nested/sales.yaml' }],
            warehouseSqlBuilder: warehouseClientMock,
            lightdashProjectConfig: { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
        });
        if (!explore || isExploreError(explore))
            throw new Error('Expected compiled native explore');
        expect(explore.tables.orders.metrics.paid_revenue).toMatchObject({
            label: metric.label,
            description: metric.description,
            type: MetricType.SUM,
            sql: metric.sql,
            dimensionReference: 'orders_amount',
            filters: [
                expect.objectContaining({
                    target: { fieldRef: 'status' },
                    values: ['paid'],
                }),
            ],
        });
        expect(explore.ymlPath).toBe('models/nested/sales.yaml');
    });

    it.each([
        { ...metric, name: 'existing_count' },
        { ...metric, name: 'status' },
        { ...metric, table: 'renamed_orders' },
        { ...metric, baseDimensionName: 'missing' },
        { ...metric, generationType: 'periodOverPeriod' as const },
        { ...metric, baseDimensionName: undefined },
    ])(
        'rejects collisions, stale sources and unsupported metric definitions ($name)',
        (field) => {
            expect(() =>
                new LightdashModelEditor(
                    source,
                    'models/orders.yml',
                ).addCustomMetrics([field]),
            ).toThrow();
        },
    );

    it('rejects filters that the YAML serializer would otherwise drop', () => {
        expect(() =>
            new LightdashModelEditor(
                source,
                'models/orders.yml',
            ).addCustomMetrics([
                {
                    ...metric,
                    filters: [{ ...metric.filters![0], includeNull: true }],
                },
            ]),
        ).toThrow('without changing its meaning');
    });

    it('rejects a second metric with the same name rather than overwriting the first', () => {
        expect(() =>
            new LightdashModelEditor(
                source,
                'models/orders.yml',
            ).addCustomMetrics([
                metric,
                { ...metric, label: 'Different meaning' },
            ]),
        ).toThrow('already exists');
    });
});
