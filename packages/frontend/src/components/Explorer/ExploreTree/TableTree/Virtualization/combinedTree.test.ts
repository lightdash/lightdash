import {
    CustomDimensionType,
    DimensionType,
    FieldType,
    MetricType,
    OrderFieldsByStrategy,
    SupportedDbtAdapter,
    TimeFrames,
    type AdditionalMetric,
    type CompiledDimension,
    type CompiledTable,
    type CustomDimension,
    type Explore,
} from '@lightdash/common';
import { isGroupNode, type NodeMap } from '../Tree/types';
import { getSearchResults } from '../Tree/utils';
import { buildCombinedFieldTree } from './combinedTree';
import { flattenTreeForVirtualization } from './flattenTree';
import { TreeSection, type FlattenTreeOptions } from './types';

const dimension = (
    table: string,
    name: string,
    overrides: Partial<CompiledDimension> = {},
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: '${TABLE}.' + name,
    compiledSql: `${table}.${name}`,
    tablesReferences: [table],
    hidden: false,
    ...overrides,
});
const table = (
    name: string,
    dimensions: CompiledDimension[],
): CompiledTable => ({
    name,
    label: name,
    database: 'db',
    schema: 'public',
    sqlTable: name,
    dimensions: Object.fromEntries(
        dimensions.map((field) => [field.name, field]),
    ),
    metrics: {},
    lineageGraph: {},
});
const explore = (tables: CompiledTable[]): Explore => ({
    name: 'users_explore',
    label: 'Users',
    tags: [],
    baseTable: 'users',
    joinedTables: tables
        .filter((t) => t.name !== 'users')
        .map((t) => ({
            table: t.name,
            sqlOn: '',
            compiledSqlOn: '',
        })),
    tables: Object.fromEntries(tables.map((t) => [t.name, t])),
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    combineJoinedFields: true,
});
const build = (value: Explore) => buildCombinedFieldTree(value, [], [], [], []);
const leaves = (nodes: NodeMap): string[] =>
    Object.values(nodes).flatMap((node) =>
        isGroupNode(node) ? leaves(node.children) : [node.key],
    );

describe('combined field tree', () => {
    it('combines metrics into one section without changing their owning tables', () => {
        const base = table('users', []);
        const joined = table('summary', []);
        for (const source of [base, joined]) {
            source.metrics.count = {
                fieldType: FieldType.METRIC,
                type: MetricType.COUNT,
                table: source.name,
                tableLabel: source.label,
                name: 'count',
                label: 'Count',
                sql: 'COUNT(*)',
                compiledSql: 'COUNT(*)',
                tablesReferences: [source.name],
                hidden: false,
                groups: ['purchases'],
            };
        }
        const result = build(explore([base, joined]));
        const map = result.nodeMaps.get('users_explore-metrics')!;
        expect(Object.values(map)).toHaveLength(1);
        expect(leaves(map)).toEqual(['users_count', 'summary_count']);
        expect(result.sections[1].itemsMap.summary_count).toBe(
            joined.metrics.count,
        );
        const flattened = flattenTreeForVirtualization({
            ...options(result),
            isSearching: true,
            searchResultsMap: {
                [result.name]: ['users_count', 'summary_count'],
            },
        });
        expect(
            flattened.items
                .filter((item) => item.type === 'section-header')
                .map((item) => item.data.label),
        ).toEqual(['Metrics']);
    });

    it('merges full group paths, keeps source fields intact, and prefers base group definitions', () => {
        const baseField = dimension('users', 'active', {
            groups: ['purchase', 'totals'],
        });
        const joinedField = dimension('summary', 'spend', {
            groups: ['purchase', 'totals'],
        });
        const base = table('users', [baseField]);
        base.groupDetails = {
            purchase: { label: 'Purchases', description: 'Base definition' },
        };
        const joined = table('summary', [joinedField]);
        joined.groupDetails = { purchase: { label: 'Other label' } };
        const value = explore([joined, base]);
        const original = structuredClone(value);
        const result = build(value);
        const map = result.nodeMaps.get('users_explore-dimensions')!;
        expect(Object.values(map)).toHaveLength(1);
        expect(Object.values(map)[0]).toMatchObject({
            label: 'Purchases',
            description: 'Base definition',
        });
        expect(leaves(map)).toEqual(['users_active', 'summary_spend']);
        expect(result.sections[0].itemsMap.users_active).toBe(baseField);
        expect(result.sections[0].itemsMap.summary_spend).toBe(joinedField);
        expect(value).toEqual(original);
    });

    it('keeps different keys and different parent paths separate even with identical labels', () => {
        const base = table('users', [
            dimension('users', 'a', { groups: ['one', 'shared'] }),
            dimension('users', 'b', { groups: ['two', 'shared'] }),
        ]);
        base.groupDetails = { one: { label: 'Same' }, two: { label: 'Same' } };
        const map = build(explore([base])).nodeMaps.get(
            'users_explore-dimensions',
        )!;
        expect(Object.values(map)).toHaveLength(2);
        expect(
            Object.values(map).map((node) => leaves({ [node.key]: node })),
        ).toEqual([['users_a'], ['users_b']]);
    });

    it('hides hidden tables and fields and disambiguates duplicate field labels', () => {
        const base = table('users', [
            dimension('users', 'id'),
            dimension('users', 'secret', { hidden: true }),
        ]);
        const joined = table('summary', [dimension('summary', 'id')]);
        const hidden = {
            ...table('private', [dimension('private', 'id')]),
            hidden: true,
        };
        const result = build(explore([base, joined, hidden]));
        const map = result.nodeMaps.get('users_explore-dimensions')!;
        expect(leaves(map)).toEqual(['users_id', 'summary_id']);
        expect(map.users_id.source).toEqual({
            label: 'users',
            showInline: true,
        });
        expect(map.summary_id.source).toEqual({
            label: 'summary',
            showInline: true,
        });
        expect(result.itemsMap).not.toHaveProperty('private_id');
    });

    it('uses aliases when source tables share a display label', () => {
        const base = table('users', [dimension('users', 'id')]);
        const first = {
            ...table('buyer', [dimension('buyer', 'id')]),
            label: 'People',
        };
        const second = {
            ...table('seller', [dimension('seller', 'id')]),
            label: 'People',
        };
        const map = build(explore([base, first, second])).nodeMaps.get(
            'users_explore-dimensions',
        )!;
        expect(map.buyer_id.source?.label).toBe('People (buyer)');
        expect(map.seller_id.source?.label).toBe('People (seller)');
    });

    it('preserves table-qualified date groups and chronological interval order', () => {
        const dateTable = (name: string) => {
            const result = table(name, [
                dimension(name, 'created_month', {
                    type: DimensionType.DATE,
                    group: 'created',
                    timeInterval: TimeFrames.MONTH,
                }),
                dimension(name, 'created_day', {
                    type: DimensionType.DATE,
                    group: 'created',
                    timeInterval: TimeFrames.DAY,
                }),
                dimension(name, 'created', {
                    type: DimensionType.DATE,
                    isIntervalBase: true,
                }),
            ]);
            result.groupDetails = { [`${name}_created`]: { label: 'Created' } };
            return result;
        };
        const map = build(
            explore([dateTable('users'), dateTable('summary')]),
        ).nodeMaps.get('users_explore-dimensions')!;
        expect(Object.values(map)).toHaveLength(2);
        expect(Object.values(map).map((node) => node.source)).toEqual([
            { label: 'users', showInline: true },
            { label: 'summary', showInline: true },
        ]);
        expect(leaves(map)).toEqual([
            'users_created_day',
            'users_created_month',
            'summary_created_day',
            'summary_created_month',
        ]);
    });

    it('uses base ordering policy and places joined table indices after base fields', () => {
        const base = table('users', [
            dimension('users', 'z', { index: 2 }),
            dimension('users', 'a', { index: 0 }),
        ]);
        base.orderFieldsBy = OrderFieldsByStrategy.INDEX;
        const joined = table('summary', [
            dimension('summary', 'b', { index: 0 }),
        ]);
        const result = build(explore([joined, base]));
        const map = result.nodeMaps.get('users_explore-dimensions')!;
        const flattened = flattenTreeForVirtualization(options(result));
        expect(
            flattened.items
                .filter((item) => item.type === 'tree-node')
                .map((item) => item.data.node.key),
        ).toEqual(['users_a', 'users_z', 'summary_b']);
        expect(leaves(map)).toHaveLength(3);
    });

    it('keeps custom fields from joined tables in their own sections', () => {
        const customMetric: AdditionalMetric = {
            table: 'summary',
            name: 'custom_count',
            label: 'Custom count',
            type: MetricType.COUNT,
            sql: '${summary.id}',
        };
        const customDimension: CustomDimension = {
            type: CustomDimensionType.SQL,
            id: 'custom_segment',
            name: 'Custom segment',
            table: 'summary',
            sql: '${summary.id}',
            dimensionType: DimensionType.STRING,
        };
        const result = buildCombinedFieldTree(
            explore([table('users', []), table('summary', [])]),
            [customMetric],
            [customDimension],
            [],
            [],
        );
        expect(
            leaves(result.nodeMaps.get('users_explore-custom-metrics')!),
        ).toEqual(['summary_custom_count']);
        expect(
            Object.values(
                result.sections.find(
                    (section) => section.type === TreeSection.CustomDimensions,
                )!.itemsMap,
            ),
        ).toEqual([customDimension]);
    });
});

const options = (
    combinedTree: ReturnType<typeof build>,
): FlattenTreeOptions => ({
    combinedTree,
    tables: [],
    showMultipleTables: true,
    expandedTables: new Set(),
    expandedGroups: new Set(),
    searchResultsMap: {},
    isSearching: false,
    additionalMetrics: [],
    customDimensions: [],
    missingCustomMetrics: [],
    missingCustomDimensions: [],
    missingFieldIds: [],
    selectedDimensions: [],
    activeFields: new Set(),
    sectionNodeMaps: combinedTree.nodeMaps,
});

describe('combined tree virtualization', () => {
    it('searches joined fields, opens matching groups, and renders no table headers', () => {
        const joined = dimension('summary', 'purchase_tier', {
            label: 'Purchase tier',
            groups: ['purchases'],
        });
        const result = build(
            explore([
                table('users', [dimension('users', 'id')]),
                table('summary', [joined]),
            ]),
        );
        const flattened = flattenTreeForVirtualization({
            ...options(result),
            isSearching: true,
            searchQuery: 'Purchase tier',
            searchResultsMap: {
                [result.name]: getSearchResults(
                    result.itemsMap,
                    'Purchase tier',
                ),
            },
        });
        expect(
            flattened.items.some((item) => item.type === 'table-header'),
        ).toBe(false);
        expect(
            flattened.items.filter((item) => item.type === 'section-header'),
        ).toHaveLength(1);
        expect(
            flattened.items
                .filter((item) => item.type === 'tree-node')
                .map((item) => item.data.node.label),
        ).toEqual(['purchases', 'Purchase tier']);
        expect(
            flattened.sectionContexts.get('users_explore-dimensions')?.itemsMap
                .summary_purchase_tier,
        ).toBe(joined);
    });

    it('excludes selected fields and reports missing fields once across the explore', () => {
        const result = build(
            explore([
                table('users', [dimension('users', 'id')]),
                table('summary', [dimension('summary', 'id')]),
            ]),
        );
        const flattened = flattenTreeForVirtualization({
            ...options(result),
            activeFields: new Set(['summary_id']),
            missingFieldIds: ['deleted_id'],
        });
        expect(
            flattened.items.filter((item) => item.type === 'missing-field'),
        ).toHaveLength(1);
        expect(
            flattened.items
                .filter((item) => item.type === 'tree-node')
                .map((item) => item.data.node.key),
        ).toEqual(['users_id']);
    });
});
