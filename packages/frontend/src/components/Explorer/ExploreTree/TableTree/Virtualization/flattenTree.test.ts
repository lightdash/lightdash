import {
    DimensionType,
    FieldType,
    getItemId,
    MetricType,
    type AdditionalMetric,
    type CompiledTable,
} from '@lightdash/common';
import type { NodeMap } from '../Tree/types';
import { getNodeMapFromItemsMap } from '../Tree/utils';
import { flattenTreeForVirtualization } from './flattenTree';
import { TreeSection, type FlattenTreeOptions } from './types';

// Mock table data
const mockTable: CompiledTable = {
    name: 'orders',
    label: 'Orders',
    database: 'test_db',
    schema: 'test_schema',
    sqlTable: 'orders',
    dimensions: {
        orders_id: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'id',
            label: 'ID',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.id',
            compiledSql: '"orders".id',
            tablesReferences: ['orders'],
            hidden: false,
            index: 0,
        },
        orders_status: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'status',
            label: 'Status',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.status',
            compiledSql: '"orders".status',
            tablesReferences: ['orders'],
            hidden: false,
            index: 1,
        },
    },
    metrics: {
        orders_total: {
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name: 'total',
            label: 'Total',
            table: 'orders',
            tableLabel: 'Orders',
            sql: 'SUM(${TABLE}.amount)',
            compiledSql: 'SUM("orders".amount)',
            tablesReferences: ['orders'],
            hidden: false,
            index: 0,
        },
    },
    lineageGraph: {},
};

const mockTableWithGroups: CompiledTable = {
    ...mockTable,
    dimensions: {
        orders_id: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'id',
            label: 'ID',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.id',
            compiledSql: '"orders".id',
            tablesReferences: ['orders'],
            hidden: false,
            index: 0,
            groups: ['identifiers'],
        },
        orders_status: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'status',
            label: 'Status',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.status',
            compiledSql: '"orders".status',
            tablesReferences: ['orders'],
            hidden: false,
            index: 1,
            groups: ['attributes'],
        },
    },
    groupDetails: {
        identifiers: {
            label: 'Identifiers',
        },
        attributes: {
            label: 'Attributes',
        },
    },
};

/**
 * Helper function to create sectionNodeMaps for tests
 */
function createSectionNodeMaps(
    tables: CompiledTable[],
    additionalMetrics: AdditionalMetric[] = [],
): Map<string, NodeMap> {
    const maps = new Map<string, NodeMap>();

    tables.forEach((table) => {
        const tableName = table.name;

        // Dimensions section
        const dimensionsMap = Object.fromEntries(
            Object.values(table.dimensions).map((d) => [getItemId(d), d]),
        );
        if (Object.keys(dimensionsMap).length > 0) {
            maps.set(
                `${tableName}-dimensions`,
                getNodeMapFromItemsMap(
                    dimensionsMap,
                    table.groupDetails,
                    table.orderFieldsBy,
                ),
            );
        }

        // Metrics section
        const metricsMap = Object.fromEntries(
            Object.values(table.metrics).map((m) => [getItemId(m), m]),
        );
        if (Object.keys(metricsMap).length > 0) {
            maps.set(
                `${tableName}-metrics`,
                getNodeMapFromItemsMap(
                    metricsMap,
                    table.groupDetails,
                    table.orderFieldsBy,
                ),
            );
        }

        // Custom metrics section
        const customMetricsForTable = additionalMetrics.filter(
            (metric) => metric.table === tableName,
        );
        if (customMetricsForTable.length > 0) {
            const customMetricsMap = Object.fromEntries(
                customMetricsForTable.map((m) => [getItemId(m), m]),
            );
            maps.set(
                `${tableName}-custom-metrics`,
                getNodeMapFromItemsMap(
                    customMetricsMap,
                    table.groupDetails,
                    table.orderFieldsBy,
                ),
            );
        }
    });

    return maps;
}

describe('flattenTreeForVirtualization', () => {
    const baseOptions: FlattenTreeOptions = {
        tables: [mockTable],
        showMultipleTables: false,
        expandedTables: new Set(['orders']),
        expandedGroups: new Set(),
        searchQuery: undefined,
        searchResultsMap: {},
        isSearching: false,
        additionalMetrics: [],
        customDimensions: [],
        missingCustomMetrics: [],
        missingCustomDimensions: [],
        missingFieldIds: [],
        selectedDimensions: [],
        activeFields: new Set(),
        sectionNodeMaps: createSectionNodeMaps([mockTable]),
    };

    it('should flatten a simple table with dimensions and metrics', () => {
        const { items: result } = flattenTreeForVirtualization(baseOptions);

        // Should have:
        // - Section header for dimensions
        // - 2 dimension nodes
        // - Section header for metrics
        // - 1 metric node
        expect(result.length).toBe(5);

        expect(result[0].type).toBe('section-header');
        expect(result[0].data).toMatchObject({
            treeSection: TreeSection.Dimensions,
            label: 'Dimensions',
        });

        expect(result[1].type).toBe('tree-node');
        expect(result[2].type).toBe('tree-node');

        expect(result[3].type).toBe('section-header');
        expect(result[3].data).toMatchObject({
            treeSection: TreeSection.Metrics,
            label: 'Metrics',
        });

        expect(result[4].type).toBe('tree-node');
    });

    it('should include table header when multiple tables are shown', () => {
        const options: FlattenTreeOptions = {
            ...baseOptions,
            showMultipleTables: true,
        };

        const { items: result } = flattenTreeForVirtualization(options);

        expect(result[0].type).toBe('table-header');
        if (result[0].type === 'table-header') {
            expect(result[0].data).toMatchObject({
                table: mockTable,
                isExpanded: true,
            });
        }
    });

    it('should not show table content when table is collapsed', () => {
        const options: FlattenTreeOptions = {
            ...baseOptions,
            showMultipleTables: true,
            expandedTables: new Set(), // No tables expanded
        };

        const { items: result } = flattenTreeForVirtualization(options);

        // Should only have table header
        expect(result.length).toBe(1);
        expect(result[0].type).toBe('table-header');
        if (result[0].type === 'table-header') {
            expect(result[0].data.isExpanded).toBe(false);
        }
    });

    it('should flatten groups correctly', () => {
        const options: FlattenTreeOptions = {
            ...baseOptions,
            tables: [mockTableWithGroups],
            sectionNodeMaps: createSectionNodeMaps([mockTableWithGroups]),
        };

        const { items: result, sectionContexts } =
            flattenTreeForVirtualization(options);

        // Should have section header + 2 group nodes (identifiers, attributes)
        const dimensionItems = result.filter(
            (item): item is Extract<typeof item, { type: 'tree-node' }> => {
                if (item.type !== 'tree-node') return false;
                const context = sectionContexts.get(item.data.sectionKey);
                return context?.sectionType === 'dimensions';
            },
        );

        // 2 groups, not expanded, so just the group headers
        expect(dimensionItems.length).toBe(2);
        expect(dimensionItems.every((item) => item.data.isGroup)).toBe(true);
    });

    it('should expand groups when in expandedGroups set', () => {
        const groupKey = 'orders-dimensions-group-Identifiers';
        const options: FlattenTreeOptions = {
            ...baseOptions,
            tables: [mockTableWithGroups],
            expandedGroups: new Set([groupKey]),
            sectionNodeMaps: createSectionNodeMaps([mockTableWithGroups]),
        };

        const { items: result, sectionContexts } =
            flattenTreeForVirtualization(options);

        const dimensionItems = result.filter((item) => {
            if (item.type !== 'tree-node') return false;
            const context = sectionContexts.get(item.data.sectionKey);
            return context?.sectionType === 'dimensions';
        });

        // 2 groups + 1 child of expanded group + 0 children of collapsed group
        expect(dimensionItems.length).toBe(3);
    });

    it('should filter by search results', () => {
        const options: FlattenTreeOptions = {
            ...baseOptions,
            searchQuery: 'status',
            isSearching: true,
            searchResultsMap: {
                orders: ['orders_status'], // Only status matches
            },
        };

        const { items: result } = flattenTreeForVirtualization(options);

        const treeNodes = result.filter((item) => item.type === 'tree-node');

        // Should only have matching nodes
        expect(treeNodes.length).toBe(1);
        expect(treeNodes[0].data.node.key).toBe('orders_status');
    });

    it('should hide tables with no search results', () => {
        const tables = [mockTable, { ...mockTable, name: 'customers' }];
        const options: FlattenTreeOptions = {
            ...baseOptions,
            tables,
            showMultipleTables: true,
            searchQuery: 'status',
            isSearching: true,
            searchResultsMap: {
                orders: ['orders_status'],
                customers: [], // No results
            },
            sectionNodeMaps: createSectionNodeMaps(tables),
        };

        const { items: result } = flattenTreeForVirtualization(options);

        const tableHeaders = result.filter(
            (item) => item.type === 'table-header',
        );

        // Should only show orders table
        expect(tableHeaders.length).toBe(1);
        expect(tableHeaders[0].data.table.name).toBe('orders');
    });

    it('should add missing field items', () => {
        const options: FlattenTreeOptions = {
            ...baseOptions,
            missingFieldIds: ['orders_deleted_field', 'orders_another_missing'],
        };

        const { items: result } = flattenTreeForVirtualization(options);

        const missingFieldItems = result.filter(
            (item) => item.type === 'missing-field',
        );

        expect(missingFieldItems.length).toBe(2);
        expect(missingFieldItems[0].data.fieldId).toBe('orders_deleted_field');
        expect(missingFieldItems[1].data.fieldId).toBe(
            'orders_another_missing',
        );

        // Should also have a "Missing fields" section header
        const missingSectionHeader = result.find(
            (item) =>
                item.type === 'section-header' &&
                item.data.label === 'Missing fields',
        );
        expect(missingSectionHeader).toBeDefined();
    });

    it('should add empty state when no dimensions exist', () => {
        const tableWithoutDimensions: CompiledTable = {
            ...mockTable,
            dimensions: {},
        };

        const options: FlattenTreeOptions = {
            ...baseOptions,
            tables: [tableWithoutDimensions],
            sectionNodeMaps: createSectionNodeMaps([tableWithoutDimensions]),
        };

        const { items: result } = flattenTreeForVirtualization(options);

        const emptyState = result.find((item) => item.type === 'empty-state');
        expect(emptyState).toBeDefined();
        expect(emptyState?.data.message).toBe(
            'No dimensions defined in your dbt project',
        );
    });

    it('should include custom metrics section when additionalMetrics exist', () => {
        const additionalMetrics = [
            {
                table: 'orders',
                name: 'custom_metric',
                label: 'Custom Metric',
                sql: 'COUNT(*)',
                type: MetricType.COUNT,
                baseDimensionName: undefined,
            },
        ];
        const options: FlattenTreeOptions = {
            ...baseOptions,
            additionalMetrics,
            sectionNodeMaps: createSectionNodeMaps(
                [mockTable],
                additionalMetrics,
            ),
        };

        const { items: result, sectionContexts } =
            flattenTreeForVirtualization(options);

        const customMetricsHeader = result.find(
            (item) =>
                item.type === 'section-header' &&
                item.data.treeSection === 'custom-metrics',
        );

        expect(customMetricsHeader).toBeDefined();

        const customMetricNodes = result.filter((item) => {
            if (item.type !== 'tree-node') return false;
            const context = sectionContexts.get(item.data.sectionKey);
            return context?.sectionType === 'custom-metrics';
        });

        expect(customMetricNodes.length).toBeGreaterThan(0);
    });

    it('should auto-expand tables when searching', () => {
        const options: FlattenTreeOptions = {
            ...baseOptions,
            expandedTables: new Set(), // No tables manually expanded
            isSearching: true,
            searchResultsMap: {
                orders: ['orders_status'],
            },
        };

        const { items: result } = flattenTreeForVirtualization(options);

        // Should still show content because isSearching=true overrides collapsed state
        expect(result.length).toBeGreaterThan(1);
    });
});
