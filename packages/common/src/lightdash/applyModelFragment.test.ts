import { parse } from 'yaml';
import { compileLightdashModels } from '../compiler/compileLightdashModels';
import { warehouseClientMock } from '../compiler/exploreCompiler.mock';
import { isExploreError, JoinRelationship } from '../types/explore';
import { DimensionType, MetricType } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import {
    applyModelFragment,
    findAccessLoss,
    parseModelFragment,
    removeModelParts,
    setModelJoinRelationships,
    type LightdashModelFragment,
} from './applyModelFragment';

const orders = `# Keep this model comment
type: model
name: orders
sql_from: public.orders
metrics:
  order_count:
    type: count
    sql: '1'
    label: Orders
dimensions:
  - name: amount # Keep this dimension comment
    type: number
    sql: \${TABLE}.amount
  - name: status
    type: string
    sql: \${TABLE}.status
  - name: customer_id
    type: number
    sql: \${TABLE}.customer_id
`;

const apply = (contents: string | null, fragment: LightdashModelFragment) =>
    applyModelFragment({
        contents,
        filename: `models/${fragment.name}.yml`,
        fragment,
    });

const compile = async (documents: string[]) => {
    const explores = await compileLightdashModels({
        models: documents.map((document) => {
            const model = parse(document);
            return { ...model, sourcePath: `models/${model.name}.yml` };
        }),
        warehouseSqlBuilder: warehouseClientMock,
        lightdashProjectConfig: { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
    });
    return explores.map((explore) => {
        if (isExploreError(explore))
            throw new Error(
                `${explore.name}: ${explore.errors.map((e) => e.message).join('; ')}`,
            );
        return explore;
    });
};

describe('applyModelFragment', () => {
    it('creates a model that compiles', async () => {
        const { contents, changes, refusals } = apply(null, {
            name: 'customers',
            sql_from: 'public.customers',
            label: 'Customers',
            dimensions: [
                {
                    name: 'id',
                    type: DimensionType.NUMBER,
                    sql: '${TABLE}.id',
                    metrics: {
                        customer_count: { type: MetricType.COUNT_DISTINCT },
                    },
                },
            ],
        });
        expect(changes).toEqual([{ path: 'customers', action: 'created' }]);
        expect(refusals).toEqual([]);
        const [explore] = await compile([contents]);
        expect(explore.tables.customers.sqlTable).toBe('public.customers');
        expect(explore.tables.customers.metrics.customer_count.type).toBe(
            MetricType.COUNT_DISTINCT,
        );
    });

    it('adds a dimension, both kinds of metric, an additional dimension and a join', async () => {
        const customers = apply(null, {
            name: 'customers',
            sql_from: 'public.customers',
            dimensions: [
                { name: 'id', type: DimensionType.NUMBER, sql: '${TABLE}.id' },
            ],
        }).contents;
        const { contents, changes, refusals } = apply(orders, {
            name: 'orders',
            dimensions: [
                {
                    name: 'created_at',
                    type: DimensionType.TIMESTAMP,
                    sql: '${TABLE}.created_at',
                },
                {
                    name: 'amount',
                    metrics: {
                        net_revenue: {
                            type: MetricType.SUM,
                            label: 'Net revenue',
                            filters: [{ status: '!refunded' }],
                        },
                    },
                    additional_dimensions: {
                        amount_band: {
                            type: DimensionType.STRING,
                            sql: "CASE WHEN ${TABLE}.amount > 100 THEN 'large' ELSE 'small' END",
                        },
                    },
                },
            ],
            metrics: {
                average_order_value: {
                    type: MetricType.NUMBER,
                    sql: '${net_revenue} / NULLIF(${order_count}, 0)',
                },
            },
            joins: [
                {
                    join: 'customers',
                    sql_on: '${orders.customer_id} = ${customers.id}',
                },
            ],
        });
        expect(refusals).toEqual([]);
        expect(changes.map((change) => change.path)).toEqual([
            'dimensions.created_at',
            'dimensions.amount.metrics.net_revenue',
            'dimensions.amount.additional_dimensions.amount_band',
            'metrics.average_order_value',
            'joins.customers',
        ]);
        expect(contents).toContain('# Keep this model comment');
        expect(contents).toContain('# Keep this dimension comment');

        const explores = await compile([contents, customers]);
        const explore = explores.find((item) => item.name === 'orders');
        if (!explore) throw new Error('Expected the orders explore');
        const table = explore.tables.orders;
        expect(table.dimensions.created_at.type).toBe(DimensionType.TIMESTAMP);
        expect(table.dimensions.amount_band.type).toBe(DimensionType.STRING);
        expect(table.metrics.net_revenue.filters).toHaveLength(1);
        expect(table.metrics.average_order_value.type).toBe(MetricType.NUMBER);
        expect(explore.joinedTables.map((join) => join.table)).toEqual([
            'customers',
        ]);
    });

    it('patches presentation keys, replacing a value that is already there', () => {
        const { contents, changes, refusals } = apply(orders, {
            name: 'orders',
            description: 'One row per order',
            dimensions: [{ name: 'amount', format: '$#,##0.00' }],
            metrics: { order_count: { label: 'Number of orders' } },
        });
        expect(refusals).toEqual([]);
        expect(changes).toEqual([
            { path: 'description', action: 'patched' },
            { path: 'dimensions.amount.format', action: 'patched' },
            { path: 'metrics.order_count.label', action: 'patched' },
        ]);
        expect(parse(contents).metrics.order_count.label).toBe(
            'Number of orders',
        );
    });

    it('refuses access and taken names, and applies the rest', () => {
        const { changes, refusals } = apply(orders, {
            name: 'orders',
            dimensions: [
                { name: 'status', hidden: false },
                {
                    name: 'region',
                    type: DimensionType.STRING,
                    sql: '${TABLE}.region',
                    required_attributes: { team: 'sales' },
                },
            ],
            metrics: {
                amount: { type: MetricType.SUM, sql: '${TABLE}.amount' },
                largest_order: { type: MetricType.MAX, sql: '${TABLE}.amount' },
            },
        });
        expect(refusals).toEqual([
            { path: 'dimensions.status.hidden', reason: 'access' },
            { path: 'dimensions.region', reason: 'access' },
            { path: 'metrics.amount', reason: 'name_taken' },
        ]);
        expect(changes).toEqual([
            { path: 'metrics.largest_order', action: 'added' },
        ]);
    });

    it('hides a field, since hiding shows nobody anything new', () => {
        const { contents, changes, refusals } = apply(orders, {
            name: 'orders',
            dimensions: [{ name: 'status', hidden: true }],
        });
        expect(refusals).toEqual([]);
        expect(changes.map(({ path }) => path)).toEqual([
            'dimensions.status.hidden',
        ]);
        expect(contents).toContain('hidden: true');
    });

    it('refuses a new definition that is missing what it needs', () => {
        const { changes, refusals } = apply(orders, {
            name: 'orders',
            dimensions: [{ name: 'region' }],
            metrics: { revenue: { label: 'Revenue' } },
            joins: [{ join: 'customers' }],
        });
        expect(changes).toEqual([]);
        expect(refusals).toEqual([
            { path: 'dimensions.region', reason: 'incomplete' },
            { path: 'metrics.revenue', reason: 'incomplete' },
            { path: 'joins.customers', reason: 'incomplete' },
        ]);
    });

    it('refuses a filter the compiler would silently drop', () => {
        const { changes, refusals } = apply(orders, {
            name: 'orders',
            dimensions: [
                {
                    name: 'amount',
                    metrics: {
                        paid_revenue: {
                            type: MetricType.SUM,
                            filters: [
                                {
                                    field: 'status',
                                    operator: '=',
                                    value: 'paid',
                                },
                            ],
                        },
                        refunded_revenue: {
                            type: MetricType.SUM,
                            filters: [{ status: 'refunded' }],
                        },
                    },
                },
            ],
        });
        expect(refusals).toEqual([
            {
                path: 'dimensions.amount.metrics.paid_revenue',
                reason: 'invalid_filter',
            },
        ]);
        expect(changes).toEqual([
            {
                path: 'dimensions.amount.metrics.refunded_revenue',
                action: 'added',
            },
        ]);
    });

    it('refuses a nested definition that is not a mapping', () => {
        const fragment = parseModelFragment(
            'orders',
            'dimensions:\n  - name: amount\n    metrics:\n      total: 3\n',
        );
        expect(apply(orders, fragment).refusals).toEqual([
            { path: 'dimensions.amount.metrics.total', reason: 'incomplete' },
        ]);
    });

    it('returns the document untouched when nothing applies', () => {
        const { contents, changes } = apply(orders, {
            name: 'orders',
            metrics: { order_count: { type: MetricType.COUNT, sql: '1' } },
        });
        expect(changes).toEqual([]);
        expect(contents).toBe(orders);
    });
});

describe('parseModelFragment', () => {
    it('reads a YAML fragment and names it after the model', () => {
        expect(
            parseModelFragment(
                'orders',
                'name: ignored\nmetrics:\n  revenue:\n    type: sum\n    sql: ${TABLE}.amount\n',
            ),
        ).toEqual({
            name: 'orders',
            metrics: { revenue: { type: 'sum', sql: '${TABLE}.amount' } },
        });
    });

    it.each([
        ['- a list', 'expected a mapping'],
        ['dimensions: [1, 2]', 'dimensions must be a list'],
        ['joins:\n  - sql_on: a = b', 'joins a list of mappings with a join'],
        ['metrics: [revenue]', 'metrics a mapping'],
        ['label: [unclosed', 'Invalid YAML'],
    ])('rejects %s', (yaml, message) => {
        expect(() => parseModelFragment('orders', yaml)).toThrow(message);
    });

    it('refuses a new model that sets who can see its rows', () => {
        expect(
            apply(null, {
                name: 'orders',
                sql_from: 'public.orders',
                dimensions: [],
                sql_filter: 'mode = 1',
            }),
        ).toEqual({
            contents: '',
            changes: [],
            refusals: [{ path: 'orders', reason: 'access' }],
        });
    });

    it('adds a primary key as a patch and replaces one as a redefinition', () => {
        const base =
            'type: model\nname: orders\nsql_from: public.orders\ndimensions: []\n';
        const addKey = (contents: string) =>
            apply(contents, { name: 'orders', primary_key: 'id' }).changes;
        expect(addKey(base)).toEqual([
            { path: 'primary_key', action: 'patched' },
        ]);
        expect(addKey(`${base}primary_key: other\n`)).toEqual([
            { path: 'primary_key', action: 'redefined' },
        ]);
    });

    it('records measured relationships on joins by alias or model', () => {
        const contents = setModelJoinRelationships({
            contents: `${orders}joins:\n  - join: a\n    sql_on: x\n  - join: b\n    alias: c\n    sql_on: y\n`,
            filename: 'models/orders.yml',
            relationships: new Map([['c', JoinRelationship.MANY_TO_ONE]]),
        });
        expect(contents).toContain(
            'alias: c\n    sql_on: y\n    relationship: many-to-one',
        );
    });

    describe('redefining what exists', () => {
        it('redefines the meaning of an existing field and reports it', () => {
            const { contents, changes, refusals } = apply(orders, {
                name: 'orders',
                dimensions: [{ name: 'amount', sql: '${TABLE}.amount / 100' }],
                metrics: {
                    order_count: { sql: 'id', type: MetricType.MAX },
                },
            });
            expect(refusals).toEqual([]);
            expect(changes).toEqual([
                { path: 'dimensions.amount.sql', action: 'redefined' },
                { path: 'metrics.order_count.sql', action: 'redefined' },
                { path: 'metrics.order_count.type', action: 'redefined' },
            ]);
            expect(contents).toContain('sql: ${TABLE}.amount / 100');
        });

        it('removes a key given as null', () => {
            const withFilter = apply(orders, {
                name: 'orders',
                metrics: { order_count: { filters: [{ status: 'paid' }] } },
            });
            const { contents, changes } = apply(
                withFilter.contents,
                parseModelFragment(
                    'orders',
                    'metrics:\n  order_count:\n    filters: null\n',
                ),
            );
            expect(changes).toEqual([
                { path: 'metrics.order_count.filters', action: 'removed' },
            ]);
            expect(contents).not.toContain('filters');
        });

        it('still refuses access and row filters', () => {
            const { contents, refusals } = apply(orders, {
                name: 'orders',
                sql_filter: '${TABLE}.org = 1',
                dimensions: [{ name: 'amount', hidden: false }],
            });
            expect(contents).toBe(orders);
            expect(refusals).toEqual([
                { path: 'sql_filter', reason: 'access' },
                { path: 'dimensions.amount.hidden', reason: 'access' },
            ]);
        });

        it('refuses a redefined filter the compiler would drop', () => {
            const { contents, refusals } = apply(orders, {
                name: 'orders',
                required_filters: [{ status: 'paid', amount: '>0' }],
            });
            expect(contents).toBe(orders);
            expect(refusals).toEqual([
                { path: 'required_filters', reason: 'invalid_filter' },
            ]);
        });

        it('refuses access keys nested in a redefined value', () => {
            const { contents, refusals } = apply(orders, {
                name: 'orders',
                explores: { paid: { tags: ['finance'] } },
            });
            expect(contents).toBe(orders);
            expect(refusals).toEqual([{ path: 'explores', reason: 'access' }]);
        });

        it('drops the measured relationship when a join condition changes', () => {
            const joined = `${orders}joins:
  - join: customers
    sql_on: \${orders.customer_id} = \${customers.id}
    relationship: many-to-one
`;
            const { contents } = apply(joined, {
                name: 'orders',
                joins: [
                    {
                        join: 'customers',
                        sql_on: '${orders.amount} = ${customers.id}',
                    },
                ],
            });
            expect(contents).toContain('${orders.amount} = ${customers.id}');
            expect(contents).not.toContain('relationship');
        });
    });

    describe('removeModelParts', () => {
        const remove = (contents: string, paths: string[]) =>
            removeModelParts({ contents, filename: 'orders.yml', paths });

        it('removes a dimension, a metric and a nested metric', () => {
            const nested = apply(orders, {
                name: 'orders',
                dimensions: [
                    {
                        name: 'amount',
                        metrics: { total: { type: MetricType.SUM } },
                    },
                ],
            }).contents;
            const { contents, changes, refusals } = remove(nested, [
                'dimensions.amount.metrics.total',
                'metrics.order_count',
                'dimensions.status',
            ]);
            expect(refusals).toEqual([]);
            expect(changes).toHaveLength(3);
            const model = parse(contents);
            expect(model.metrics).toBeUndefined();
            expect(
                model.dimensions.map((d: { name: string }) => d.name),
            ).toEqual(['amount', 'customer_id']);
            expect(model.dimensions[0].metrics).toBeUndefined();
        });

        it('removes a join by its alias, and reports what it cannot find', () => {
            const joined = `${orders}joins:
  - join: customers
    alias: buyer
    sql_on: x
`;
            const { contents, refusals } = remove(joined, [
                'joins.buyer',
                'metrics.nope',
                'dimensions.status.sql',
            ]);
            expect(parse(contents).joins).toBeUndefined();
            expect(refusals).toEqual([
                { path: 'metrics.nope', reason: 'not_found' },
                { path: 'dimensions.status.sql', reason: 'not_found' },
            ]);
        });
    });
});

describe('findAccessLoss', () => {
    const guarded = `type: model
name: people
sql_from: public.people
sql_filter: \${TABLE}.org = 1
dimensions:
  - name: ssn
    type: string
    sql: \${TABLE}.ssn
    required_attributes:
      team: hr
  - name: id
    type: number
    sql: \${TABLE}.id
    hidden: true
`;

    it('names each part whose access a rewrite drops, however it got there', () => {
        const stripped = guarded
            .replace('sql_filter: ${TABLE}.org = 1\n', '')
            .replace('    required_attributes:\n      team: hr\n', '')
            .replace('    hidden: true\n', '');
        expect(findAccessLoss(guarded, stripped)).toEqual([
            'the model',
            'dimensions.ssn',
            'dimensions.id',
        ]);
    });

    it('lets a part go, hide, or stay as it is', () => {
        const withoutSsn = guarded.replace(
            / {2}- name: ssn[\s\S]*?team: hr\n/,
            '',
        );
        expect(findAccessLoss(guarded, withoutSsn)).toEqual([]);
        expect(findAccessLoss(guarded, guarded)).toEqual([]);
        expect(
            findAccessLoss(guarded.replace('    hidden: true\n', ''), guarded),
        ).toEqual([]);
    });
});
