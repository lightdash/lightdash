import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    doesFilterApplyToTile,
    getFilterTileRelation,
    getSavedFilterFieldStatus,
    getValidSqlColumnReferences,
    getTabsForFilterRule,
    type SavedFilterFieldsByTileUuid,
} from './index';

// Helper to create a mock filter rule
const createMockFilterRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'filter-1',
    target: {
        fieldId: 'orders_status',
        tableName: 'orders',
    },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
    label: 'Filter 1',
    ...overrides,
});

// Helper to create a mock dashboard tile
const createMockTile = (uuid: string, tabUuid?: string): DashboardTile =>
    ({
        uuid,
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 1,
        w: 1,
        tabUuid,
        properties: {
            savedChartUuid: 'chart-1',
            title: `Tile ${uuid}`,
        },
    }) satisfies DashboardTile;

const createMockDataAppTile = (uuid: string, tabUuid?: string): DashboardTile =>
    ({
        uuid,
        type: DashboardTileTypes.DATA_APP,
        x: 0,
        y: 0,
        h: 1,
        w: 1,
        tabUuid,
        properties: {
            appUuid: 'app-1',
            title: `Data App ${uuid}`,
        },
    }) satisfies DashboardTile;

// Helper to create mock filterable fields
const createMockFilterableField = (
    fieldId: string,
    table: string,
): FilterableDimension =>
    ({
        name: fieldId.replace(`${table}_`, ''),
        table,
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
    }) as FilterableDimension;

describe('getValidSqlColumnReferences', () => {
    it('drops SQL columns that cannot be represented as Select options', () => {
        expect(
            getValidSqlColumnReferences([
                { reference: 'orders_id' },
                { reference: undefined },
                {},
                { reference: null },
                { reference: 'orders_total' },
            ]),
        ).toEqual(['orders_id', 'orders_total']);
    });
});

describe('getFilterTileRelation', () => {
    it('should return "auto" when no tileTargets configuration exists', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });
        const result = getFilterTileRelation(filterRule, 'tile-1');

        expect(result.relation).toBe('auto');
        expect(result.tileConfig).toBeUndefined();
    });

    it('should return "disabled" when tile is explicitly excluded (tileConfig === false)', () => {
        const filterRule = createMockFilterRule({
            tileTargets: { 'tile-1': false },
        });
        const result = getFilterTileRelation(filterRule, 'tile-1');

        expect(result.relation).toBe('disabled');
        expect(result.tileConfig).toBe(false);
    });

    it('should return "mapped" when tile has explicit field mapping', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-1': {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            },
        });
        const result = getFilterTileRelation(filterRule, 'tile-1');

        expect(result.relation).toBe('mapped');
        expect(result.tileConfig).toEqual({
            fieldId: 'orders_status',
            tableName: 'orders',
        });
    });

    it('should return "auto" when tile is not in tileTargets (applies automatically)', () => {
        const filterRule = createMockFilterRule({
            tileTargets: { 'other-tile': false },
        });
        const result = getFilterTileRelation(filterRule, 'tile-1');

        expect(result.relation).toBe('auto');
        expect(result.tileConfig).toBeUndefined();
    });
});

describe('doesFilterApplyToTile', () => {
    const tile1 = createMockTile('tile-1', 'tab-1');
    const tile2 = createMockTile('tile-2', 'tab-2');

    it('applies auto-targeted filters to Data App tiles with runtime query fields', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });
        const dataAppTile = createMockDataAppTile('data-app-1', 'tab-1');

        expect(doesFilterApplyToTile(filterRule, dataAppTile, {})).toBe(true);
    });

    it('should return true when no tileTargets and tile has the filter field', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });
        const filterableFieldsByTileUuid = {
            'tile-1': [createMockFilterableField('orders_status', 'orders')],
            'tile-2': [createMockFilterableField('orders_status', 'orders')],
        };

        expect(
            doesFilterApplyToTile(
                filterRule,
                tile1,
                filterableFieldsByTileUuid,
            ),
        ).toBe(true);
        expect(
            doesFilterApplyToTile(
                filterRule,
                tile2,
                filterableFieldsByTileUuid,
            ),
        ).toBe(true);
    });

    it('should return false when no tileTargets and tile does not have the filter field', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });
        const filterableFieldsByTileUuid = {
            'tile-1': [
                createMockFilterableField('customers_name', 'customers'),
            ],
        };

        expect(
            doesFilterApplyToTile(
                filterRule,
                tile1,
                filterableFieldsByTileUuid,
            ),
        ).toBe(false);
    });

    it('should return false when no tileTargets and filterableFieldsByTileUuid is undefined', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });

        expect(doesFilterApplyToTile(filterRule, tile1, undefined)).toBe(false);
    });

    it('should return false when tile is explicitly excluded', () => {
        const filterRule = createMockFilterRule({
            tileTargets: { 'tile-1': false },
        });

        expect(doesFilterApplyToTile(filterRule, tile1, undefined)).toBe(false);
    });

    it('should return true when tile is explicitly included with field mapping', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-1': {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            },
        });

        expect(doesFilterApplyToTile(filterRule, tile1, undefined)).toBe(true);
    });

    it('should return true when tile has the filter field by default', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'other-tile': false, // Some other tile is excluded
            },
        });
        const filterableFieldsByTileUuid = {
            'tile-1': [createMockFilterableField('orders_status', 'orders')],
        };

        expect(
            doesFilterApplyToTile(
                filterRule,
                tile1,
                filterableFieldsByTileUuid,
            ),
        ).toBe(true);
    });

    it('should return false when tile does not have the filter field', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'other-tile': false, // Some other tile is excluded
            },
        });
        const filterableFieldsByTileUuid = {
            'tile-1': [
                createMockFilterableField('customers_name', 'customers'),
            ],
        };

        expect(
            doesFilterApplyToTile(
                filterRule,
                tile1,
                filterableFieldsByTileUuid,
            ),
        ).toBe(false);
    });

    it('should return false when filterableFieldsByTileUuid is undefined and tile is not explicitly included', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'other-tile': false,
            },
        });

        expect(doesFilterApplyToTile(filterRule, tile1, undefined)).toBe(false);
    });
});

describe('getTabsForFilterRule', () => {
    const tile1Tab1 = createMockTile('tile-1', 'tab-1');
    const tile2Tab1 = createMockTile('tile-2', 'tab-1');
    const tile3Tab2 = createMockTile('tile-3', 'tab-2');
    const tile4Tab3 = createMockTile('tile-4', 'tab-3');
    const dashboardTiles = [tile1Tab1, tile2Tab1, tile3Tab2, tile4Tab3];
    const sortedTabUuids = ['tab-1', 'tab-2', 'tab-3'];

    it('should return tabs where tiles have the filter field when no tileTargets', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });
        const filterableFieldsByTileUuid = {
            'tile-1': [createMockFilterableField('orders_status', 'orders')],
            'tile-3': [createMockFilterableField('orders_status', 'orders')],
            // tile-2 and tile-4 don't have the field
        };

        const result = getTabsForFilterRule(
            filterRule,
            dashboardTiles,
            sortedTabUuids,
            filterableFieldsByTileUuid,
        );

        // tile-1 has field (tab-1), tile-3 has field (tab-2)
        // tile-2, tile-4 don't have field so tab-3 is excluded
        expect(result).toEqual(['tab-1', 'tab-2']);
    });

    it('includes a Data App tab by default and removes it when explicitly excluded', () => {
        const dataAppTile = createMockDataAppTile('data-app-1', 'tab-2');

        expect(
            getTabsForFilterRule(
                createMockFilterRule({ tileTargets: undefined }),
                [dataAppTile],
                sortedTabUuids,
                {},
            ),
        ).toEqual(['tab-2']);

        expect(
            getTabsForFilterRule(
                createMockFilterRule({
                    tileTargets: { 'data-app-1': false },
                }),
                [dataAppTile],
                sortedTabUuids,
                {},
            ),
        ).toEqual([]);
    });

    it('should return empty when no tileTargets and no tiles have the field', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });
        const filterableFieldsByTileUuid = {
            'tile-1': [
                createMockFilterableField('customers_name', 'customers'),
            ],
        };

        const result = getTabsForFilterRule(
            filterRule,
            dashboardTiles,
            sortedTabUuids,
            filterableFieldsByTileUuid,
        );

        expect(result).toEqual([]);
    });

    it('should return empty when no tileTargets and filterableFieldsByTileUuid is undefined', () => {
        const filterRule = createMockFilterRule({ tileTargets: undefined });

        const result = getTabsForFilterRule(
            filterRule,
            dashboardTiles,
            sortedTabUuids,
            undefined,
        );

        expect(result).toEqual([]);
    });

    it('should return only tabs with explicitly included tiles', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-1': {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
                'tile-3': {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
                'tile-4': false, // Explicitly excluded
            },
        });

        const result = getTabsForFilterRule(
            filterRule,
            dashboardTiles,
            sortedTabUuids,
            undefined,
        );

        // tile-1 is in tab-1, tile-3 is in tab-2
        // tile-4 is excluded so tab-3 should not appear
        expect(result).toEqual(['tab-1', 'tab-2']);
    });

    it('should include tabs with tiles that have the field by default', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-1': false, // Excluded
            },
        });
        const filterableFieldsByTileUuid = {
            'tile-2': [createMockFilterableField('orders_status', 'orders')],
            'tile-3': [createMockFilterableField('orders_status', 'orders')],
            'tile-4': [
                createMockFilterableField('customers_name', 'customers'),
            ], // Different field
        };

        const result = getTabsForFilterRule(
            filterRule,
            dashboardTiles,
            sortedTabUuids,
            filterableFieldsByTileUuid,
        );

        // tile-1 is excluded
        // tile-2 has the field (tab-1)
        // tile-3 has the field (tab-2)
        // tile-4 does not have the field (tab-3 excluded)
        expect(result).toEqual(['tab-1', 'tab-2']);
    });

    it('should return empty array when all tiles are excluded', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-1': false,
                'tile-2': false,
                'tile-3': false,
                'tile-4': false,
            },
        });

        const result = getTabsForFilterRule(
            filterRule,
            dashboardTiles,
            sortedTabUuids,
            undefined,
        );

        expect(result).toEqual([]);
    });

    it('should handle tiles without tabUuid', () => {
        const tileWithoutTab = createMockTile('tile-no-tab', undefined);
        const tilesWithMixed = [...dashboardTiles, tileWithoutTab];

        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-no-tab': {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            },
        });

        const result = getTabsForFilterRule(
            filterRule,
            tilesWithMixed,
            sortedTabUuids,
            undefined,
        );

        // tile-no-tab has no tabUuid so it shouldn't contribute to any tab
        expect(result).toEqual([]);
    });

    it('should handle empty dashboard tiles', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-1': {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            },
        });

        const result = getTabsForFilterRule(
            filterRule,
            [],
            sortedTabUuids,
            undefined,
        );

        expect(result).toEqual([]);
    });

    it('should handle undefined dashboard tiles', () => {
        const filterRule = createMockFilterRule({
            tileTargets: {
                'tile-1': {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            },
        });

        const result = getTabsForFilterRule(
            filterRule,
            undefined,
            sortedTabUuids,
            undefined,
        );

        expect(result).toEqual([]);
    });
});

describe('hidden model fields kept executable', () => {
    const tile1 = createMockTile('tile-1', 'tab-1');
    const tile2 = createMockTile('tile-2', 'tab-2');
    const hiddenStatus: SavedFilterFieldsByTileUuid = {
        'tile-1': [
            {
                fieldId: 'orders_status',
                fallbackType: DimensionType.STRING,
            },
        ],
    };

    describe('getSavedFilterFieldStatus', () => {
        it('resolves a saved rule whose dimension the pickers omit', () => {
            expect(
                getSavedFilterFieldStatus(createMockFilterRule(), hiddenStatus),
            ).toEqual({
                fieldId: 'orders_status',
                fallbackType: DimensionType.STRING,
                hasConflictingTypes: false,
            });
        });

        it('does not resolve a field that no tile can execute', () => {
            expect(
                getSavedFilterFieldStatus(
                    createMockFilterRule({
                        target: {
                            fieldId: 'orders_deleted_column',
                            tableName: 'orders',
                        },
                    }),
                    hiddenStatus,
                ),
            ).toBeUndefined();
        });

        it('never claims a SQL column rule as a hidden model field', () => {
            const sqlRule = createMockFilterRule({
                target: {
                    fieldId: 'orders_status',
                    tableName: 'sql_chart',
                    isSqlColumn: true,
                    fallbackType: DimensionType.STRING,
                },
            });

            expect(
                getSavedFilterFieldStatus(sqlRule, hiddenStatus),
            ).toBeUndefined();
        });

        it('ignores a SQL column tile override when resolving a model rule', () => {
            const filterRule = createMockFilterRule({
                target: {
                    fieldId: 'orders_deleted_column',
                    tableName: 'orders',
                },
                tileTargets: {
                    'tile-1': {
                        fieldId: 'orders_status',
                        tableName: 'sql_chart',
                        isSqlColumn: true,
                    },
                },
            });

            expect(
                getSavedFilterFieldStatus(filterRule, hiddenStatus),
            ).toBeUndefined();
        });

        it('resolves nothing when the server did not send the status map', () => {
            expect(
                getSavedFilterFieldStatus(createMockFilterRule(), undefined),
            ).toBeUndefined();
        });

        it("reads a tile's own override rather than the rule's main target", () => {
            const filterRule = createMockFilterRule({
                target: {
                    fieldId: 'orders_deleted_column',
                    tableName: 'orders',
                },
                tileTargets: {
                    'tile-1': {
                        fieldId: 'orders_status',
                        tableName: 'orders',
                    },
                },
            });

            expect(getSavedFilterFieldStatus(filterRule, hiddenStatus)).toEqual(
                {
                    fieldId: 'orders_status',
                    fallbackType: DimensionType.STRING,
                    hasConflictingTypes: false,
                },
            );
        });

        it('resolves a hidden date dimension to its own type, not a string default', () => {
            expect(
                getSavedFilterFieldStatus(createMockFilterRule(), {
                    'tile-1': [
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.DATE,
                        },
                    ],
                })?.fallbackType,
            ).toBe(DimensionType.DATE);
        });

        it('resolves a hidden metric the same way as a hidden dimension', () => {
            const metricRule = createMockFilterRule({
                target: {
                    fieldId: 'orders_total_revenue',
                    tableName: 'orders',
                },
                operator: FilterOperator.GREATER_THAN,
                values: [0],
            });

            expect(
                getSavedFilterFieldStatus(metricRule, {
                    'tile-1': [
                        {
                            fieldId: 'orders_total_revenue',
                            fallbackType: DimensionType.NUMBER,
                        },
                    ],
                })?.fallbackType,
            ).toBe(DimensionType.NUMBER);
        });

        it('reports conflicting types between merge sources on one tile', () => {
            expect(
                getSavedFilterFieldStatus(createMockFilterRule(), {
                    'tile-1': [
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.DATE,
                        },
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.STRING,
                        },
                    ],
                }),
            ).toEqual({
                fieldId: 'orders_status',
                fallbackType: DimensionType.DATE,
                hasConflictingTypes: true,
            });
        });

        it('picks the same type whatever order one tile lists its sources in', () => {
            const resolved = [
                [DimensionType.DATE, DimensionType.STRING],
                [DimensionType.STRING, DimensionType.DATE],
            ].map((types) =>
                getSavedFilterFieldStatus(createMockFilterRule(), {
                    'tile-1': types.map((fallbackType) => ({
                        fieldId: 'orders_status',
                        fallbackType,
                    })),
                }),
            );

            expect(resolved[0]).toEqual(resolved[1]);
        });

        it('stays unconflicted when one tile repeats the same id and type', () => {
            expect(
                getSavedFilterFieldStatus(createMockFilterRule(), {
                    'tile-1': [
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.NUMBER,
                        },
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.NUMBER,
                        },
                    ],
                }),
            ).toEqual({
                fieldId: 'orders_status',
                fallbackType: DimensionType.NUMBER,
                hasConflictingTypes: false,
            });
        });

        it('reports conflicting types and picks the same one whatever the tile order', () => {
            const conflicting = [
                {
                    'tile-b': [
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.DATE,
                        },
                    ],
                    'tile-a': [
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.STRING,
                        },
                    ],
                },
                {
                    'tile-a': [
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.STRING,
                        },
                    ],
                    'tile-b': [
                        {
                            fieldId: 'orders_status',
                            fallbackType: DimensionType.DATE,
                        },
                    ],
                },
            ] satisfies SavedFilterFieldsByTileUuid[];

            const resolved = conflicting.map((status) =>
                getSavedFilterFieldStatus(createMockFilterRule(), status),
            );

            expect(resolved[0]).toEqual(resolved[1]);
            expect(resolved[0]).toEqual({
                fieldId: 'orders_status',
                fallbackType: DimensionType.DATE,
                hasConflictingTypes: true,
            });
        });
    });

    describe('doesFilterApplyToTile', () => {
        it('applies to a tile that can only execute the field, not offer it', () => {
            expect(
                doesFilterApplyToTile(
                    createMockFilterRule(),
                    tile1,
                    {},
                    hiddenStatus,
                ),
            ).toBe(true);
        });

        it('still excludes a tile the rule turned off', () => {
            expect(
                doesFilterApplyToTile(
                    createMockFilterRule({
                        tileTargets: { 'tile-1': false },
                    }),
                    tile1,
                    {},
                    hiddenStatus,
                ),
            ).toBe(false);
        });

        it('does not apply to a tile whose explore lacks the field', () => {
            expect(
                doesFilterApplyToTile(
                    createMockFilterRule(),
                    tile2,
                    {},
                    hiddenStatus,
                ),
            ).toBe(false);
        });

        it('drops a mapped target that no longer exists once the status map is available', () => {
            const filterRule = createMockFilterRule({
                tileTargets: {
                    'tile-1': {
                        fieldId: 'orders_deleted_column',
                        tableName: 'orders',
                    },
                },
            });

            expect(doesFilterApplyToTile(filterRule, tile1, {})).toBe(true);
            expect(
                doesFilterApplyToTile(filterRule, tile1, {}, hiddenStatus),
            ).toBe(false);
        });

        it('keeps a mapped target that the pickers still offer', () => {
            const filterRule = createMockFilterRule({
                tileTargets: {
                    'tile-1': {
                        fieldId: 'orders_status',
                        tableName: 'orders',
                    },
                },
            });

            expect(
                doesFilterApplyToTile(
                    filterRule,
                    tile1,
                    {
                        'tile-1': [
                            createMockFilterableField(
                                'orders_status',
                                'orders',
                            ),
                        ],
                    },
                    {},
                ),
            ).toBe(true);
        });

        it('never validates a mapped SQL column against the field maps', () => {
            const filterRule = createMockFilterRule({
                tileTargets: {
                    'tile-1': {
                        fieldId: 'status',
                        tableName: 'sql_chart',
                        isSqlColumn: true,
                    },
                },
            });

            expect(
                doesFilterApplyToTile(filterRule, tile1, {}, hiddenStatus),
            ).toBe(true);
        });

        it('never validates a mapped Data App tile against the field maps', () => {
            const dataAppTile = createMockDataAppTile('tile-1', 'tab-1');
            const filterRule = createMockFilterRule({
                tileTargets: {
                    'tile-1': {
                        fieldId: 'orders_deleted_column',
                        tableName: 'orders',
                    },
                },
            });

            expect(
                doesFilterApplyToTile(
                    filterRule,
                    dataAppTile,
                    {},
                    hiddenStatus,
                ),
            ).toBe(true);
        });
    });

    describe('getTabsForFilterRule', () => {
        it('reports the tab of a tile that can only execute the field', () => {
            expect(
                getTabsForFilterRule(
                    createMockFilterRule(),
                    [tile1, tile2],
                    ['tab-1', 'tab-2'],
                    {},
                    hiddenStatus,
                ),
            ).toEqual(['tab-1']);
        });

        it('reports no tabs for a field that was really deleted', () => {
            expect(
                getTabsForFilterRule(
                    createMockFilterRule({
                        target: {
                            fieldId: 'orders_deleted_column',
                            tableName: 'orders',
                        },
                    }),
                    [tile1, tile2],
                    ['tab-1', 'tab-2'],
                    {},
                    hiddenStatus,
                ),
            ).toEqual([]);
        });
    });
});
