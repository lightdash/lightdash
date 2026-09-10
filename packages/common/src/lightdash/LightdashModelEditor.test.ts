import { parse } from 'yaml';
import { compileLightdashModels } from '../compiler/compileLightdashModels';
import { warehouseClientMock } from '../compiler/exploreCompiler.mock';
import { isExploreError } from '../types/explore';
import {
    BinType,
    CustomDimensionType,
    DimensionType,
    GroupValueMatchType,
    MetricType,
    type CustomDimension,
} from '../types/field';
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

    const customDimensions: CustomDimension[] = [
        {
            id: 'amount_times_ten',
            name: 'Amount times ten',
            table: 'orders',
            type: CustomDimensionType.SQL,
            dimensionType: DimensionType.NUMBER,
            sql: '${orders.amount} * 10',
        },
        {
            id: 'amount_band',
            name: 'Amount band',
            table: 'orders',
            type: CustomDimensionType.BIN,
            dimensionId: 'orders_amount',
            binType: BinType.FIXED_WIDTH,
            binWidth: 10,
        },
        {
            id: 'amount_range',
            name: 'Amount range',
            table: 'orders',
            type: CustomDimensionType.BIN,
            dimensionId: 'orders_amount',
            binType: BinType.CUSTOM_RANGE,
            customRange: [
                { from: undefined, to: 10 },
                { from: 10, to: undefined },
            ],
        },
        {
            id: 'amount_group',
            name: 'Amount group',
            table: 'orders',
            type: CustomDimensionType.BIN,
            dimensionId: 'orders_amount',
            binType: BinType.CUSTOM_GROUP,
            customGroups: [
                {
                    name: 'Twenty',
                    values: [
                        { matchType: GroupValueMatchType.EXACT, value: '20' },
                    ],
                },
            ],
        },
    ];

    it.each(customDimensions)(
        'appends and compiles native $id while preserving the original document',
        async (dimension) => {
            const output = new LightdashModelEditor(source, 'models/orders.yml')
                .addCustomDimensions([dimension], warehouseClientMock)
                .toString();
            expect(output.startsWith(source)).toBe(true);
            const model = parse(output);
            const added = model.dimensions.at(-1);
            expect(added.name).toBe(dimension.id);
            expect(added.sql).toContain(
                dimension.type === CustomDimensionType.SQL
                    ? '${orders.amount}'
                    : '${TABLE}.amount * 2',
            );
            expect(model).not.toHaveProperty('models');
            const [explore] = await compileLightdashModels({
                models: [{ ...model, sourcePath: 'models/orders.yml' }],
                warehouseSqlBuilder: warehouseClientMock,
                lightdashProjectConfig: { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
            });
            if (!explore || isExploreError(explore))
                throw new Error('Expected compiled native explore');
            expect(
                explore.tables.orders.dimensions[dimension.id].compiledSql,
            ).toContain('amount');
        },
    );

    it('keeps trailing model properties and comments when appending dimensions', () => {
        const footer = '# Keep this root property\nprimary_key: amount\n';
        const output = new LightdashModelEditor(
            source + footer,
            'models/orders.yml',
        )
            .addCustomDimensions([customDimensions[0]], warehouseClientMock)
            .toString();
        expect(output).toContain(footer);
        expect(parse(output).primary_key).toBe('amount');
        expect(parse(output).dimensions.at(-1).name).toBe('amount_times_ten');
    });

    it('rejects fixed-number bins instead of persisting query-dependent boundaries', () => {
        expect(() =>
            new LightdashModelEditor(
                source,
                'models/orders.yml',
            ).addCustomDimensions(
                [
                    {
                        id: 'unsupported',
                        name: 'Unsupported',
                        table: 'orders',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'orders_amount',
                        binType: BinType.FIXED_NUMBER,
                        binNumber: 4,
                    },
                ],
                warehouseClientMock,
            ),
        ).toThrow('Fixed-number bins cannot be written back');
    });

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
