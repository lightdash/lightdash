// CoderService.test.ts
import {
    AnyType,
    CartesianSeriesType,
    ChartType,
    DashboardDAO,
    DashboardFilterRule,
    DashboardTileTarget,
    DashboardTileTypes,
} from '@lightdash/common';
import { CoderService } from './CoderService';

describe('CoderService', () => {
    describe('transformChart', () => {
        it('preserves per-value pivot series customizations for chart-as-code download', () => {
            const chartConfig = {
                type: ChartType.CARTESIAN,
                config: {
                    eChartsConfig: {
                        series: [
                            {
                                color: '#1f77b4',
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'High',
                                            },
                                        ],
                                    },
                                },
                                isFilteredOut: false,
                                name: 'High tier custom blue',
                                type: CartesianSeriesType.LINE,
                                yAxisIndex: 0,
                            },
                            {
                                color: '#d62728',
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Low',
                                            },
                                        ],
                                    },
                                },
                                isFilteredOut: true,
                                name: 'Low tier hidden red',
                                type: CartesianSeriesType.LINE,
                                yAxisIndex: 0,
                            },
                            {
                                color: '#2ca02c',
                                encode: {
                                    xRef: { field: 'events_date_day' },
                                    yRef: {
                                        field: 'events_count',
                                        pivotValues: [
                                            {
                                                field: 'events_event_tier',
                                                value: 'Very high',
                                            },
                                        ],
                                    },
                                },
                                isFilteredOut: false,
                                name: 'Very high tier green',
                                type: CartesianSeriesType.LINE,
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                    layout: {
                        xField: 'events_date_day',
                        yField: ['events_count'],
                    },
                },
            };

            const result = (
                CoderService as unknown as {
                    transformChart: (...args: AnyType[]) => AnyType;
                }
            ).transformChart(
                {
                    chartConfig,
                    dashboardUuid: null,
                    description: null,
                    metricQuery: {
                        additionalMetrics: [],
                        customDimensions: [],
                        dimensionOverrides: {},
                        dimensions: ['events_event_tier', 'events_date_day'],
                        exploreName: 'events',
                        filters: {},
                        limit: 500,
                        metricOverrides: {},
                        metrics: ['events_count'],
                        sorts: [
                            {
                                descending: false,
                                fieldId: 'events_event_tier',
                            },
                        ],
                        tableCalculations: [],
                        timezone: 'project_timezone',
                    },
                    name: 'PROD-8534 pivot hidden series test',
                    parameters: undefined,
                    pivotConfig: {
                        columns: ['events_event_tier'],
                    },
                    slug: 'prod-8534-pivot-hidden-series-test',
                    spaceUuid: 'space-uuid',
                    tableConfig: {
                        columnOrder: [
                            'events_event_tier',
                            'events_date_day',
                            'events_count',
                        ],
                    },
                    tableName: 'events',
                    updatedAt: new Date('2026-06-29T11:49:43.855Z'),
                    uuid: 'chart-uuid',
                },
                [
                    {
                        name: 'Jaffle shop',
                        path: 'jaffle_shop',
                        uuid: 'space-uuid',
                    },
                ],
                {},
                new Map(),
            );

            const { series } = result.chartConfig.config.eChartsConfig;
            expect(series).toHaveLength(3);
            expect(
                series.map((s: AnyType) => s.encode.yRef.pivotValues[0]),
            ).toEqual([
                { field: 'events_event_tier', value: 'High' },
                { field: 'events_event_tier', value: 'Low' },
                { field: 'events_event_tier', value: 'Very high' },
            ]);
            expect(series[1]).toEqual(
                expect.objectContaining({
                    color: '#d62728',
                    isFilteredOut: true,
                    name: 'Low tier hidden red',
                }),
            );
        });
    });

    describe('getChartSlugForTileUuid', () => {
        it('should return undefined when chart tile slug is null', () => {
            const mockDashboard = {
                tiles: [
                    {
                        uuid: 'uuid-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: null },
                    },
                ],
            } as AnyType;

            expect(
                CoderService.getChartSlugForTileUuid(mockDashboard, 'uuid-1'),
            ).toBeUndefined();
        });
    });

    describe('getFiltersWithTileSlugs', () => {
        it('should convert tile UUIDs to slugs in filters', () => {
            const mockDashboard: DashboardDAO = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'uuid-1': {
                                    fieldId: 'field-1',
                                } as DashboardTileTarget,
                                'uuid-2': {
                                    fieldId: 'field-2',
                                } as DashboardTileTarget,
                            },
                        },
                    ],
                },
                tiles: [
                    {
                        uuid: 'uuid-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: 'slug-1' },
                    },
                    {
                        uuid: 'uuid-2',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: 'slug-2' },
                    },
                    {
                        uuid: 'uuid-3',
                        type: DashboardTileTypes.MARKDOWN,
                        properties: {},
                    },
                ],
            } as AnyType; // Use 'as any' to bypass type checks for simplicity

            const result = CoderService.getFiltersWithTileSlugs(mockDashboard);

            expect(
                (result.dimensions[0] as DashboardFilterRule).tileTargets,
            ).toEqual({
                'slug-1': { fieldId: 'field-1' },
                'slug-2': { fieldId: 'field-2' },
            });
        });

        it('should handle filters with no tile targets', () => {
            const mockDashboard: DashboardDAO = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {},
                        },
                    ],
                },
                tiles: [],
            } as AnyType;

            const result = CoderService.getFiltersWithTileSlugs(mockDashboard);

            expect(
                (result.dimensions[0] as DashboardFilterRule).tileTargets,
            ).toEqual({});
        });

        it('should skip tile targets with no matching slug', () => {
            const mockDashboard: DashboardDAO = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'uuid-1': {
                                    fieldId: 'field-1',
                                } as DashboardTileTarget,
                            },
                        },
                    ],
                },
                tiles: [],
            } as AnyType;

            const result = CoderService.getFiltersWithTileSlugs(mockDashboard);

            expect(
                (result.dimensions[0] as DashboardFilterRule).tileTargets,
            ).toEqual({});
        });
    });

    describe('getFiltersWithTileUuids', () => {
        it('should convert tile slugs to UUIDs in filters', () => {
            const dashboardAsCode = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'chart-slug-1': {
                                    someTargetProperty: 'value1',
                                },
                                'chart-slug-2': {
                                    someTargetProperty: 'value2',
                                },
                            },
                        },
                    ],
                },
                // ... other properties
            };

            const tilesWithUuids = [
                {
                    uuid: 'uuid-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-1' },
                },
                {
                    uuid: 'uuid-2',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-2' },
                },
                {
                    uuid: 'uuid-3',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: {},
                },
            ];

            const result = CoderService.getFiltersWithTileUuids(
                dashboardAsCode as AnyType,
                tilesWithUuids as AnyType,
            );

            expect(result.dimensions[0].tileTargets).toEqual({
                'uuid-1': { someTargetProperty: 'value1' },
                'uuid-2': { someTargetProperty: 'value2' },
            });
            expect(typeof result.dimensions[0].id).toBe('string'); // uuid
            expect(result.dimensions[0].id.length).toBeGreaterThan(1);
        });

        it('should log an error if a tile slug does not match any UUID', () => {
            console.error = jest.fn();

            const dashboardAsCode = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'chart-slug-1': {
                                    someTargetProperty: 'value1',
                                },
                                'chart-slug-3': {
                                    someTargetProperty: 'value3',
                                },
                            },
                        },
                    ],
                },
                // ... other properties
            };

            const tilesWithUuids = [
                {
                    uuid: 'uuid-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-1' },
                },
                {
                    uuid: 'uuid-2',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'chart-slug-2' },
                },
                {
                    uuid: 'uuid-3',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: {},
                },
            ];

            const result = CoderService.getFiltersWithTileUuids(
                dashboardAsCode as AnyType,
                tilesWithUuids as AnyType,
            );

            // We show an error for chart-slug-2
            expect(console.error).toHaveBeenCalledWith(
                'Tile with slug chart-slug-3 not found in tilesWithUuids',
            );
            // but chart-slug-1 should be fine
            expect(result.dimensions[0].tileTargets).toEqual({
                'uuid-1': {
                    someTargetProperty: 'value1',
                },
            });
        });
    });

    describe('getConfigWithDateZoomTileSlugs', () => {
        it('should convert date zoom tileTargets tile UUIDs to slugs', () => {
            const mockDashboard = {
                config: {
                    isDateZoomDisabled: false,
                    dateZoomConfig: {
                        controls: [
                            {
                                uuid: 'control-1',
                                name: 'Revenue zoom',
                                granularity: 'WEEK',
                            },
                        ],
                        tileTargets: {
                            'uuid-1': {
                                controlUuid: 'control-1',
                                fieldId: 'orders_order_date',
                                tableName: 'orders',
                            },
                        },
                    },
                },
                tiles: [
                    {
                        uuid: 'uuid-1',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: 'slug-1' },
                    },
                ],
            } as AnyType;

            const result =
                CoderService.getConfigWithDateZoomTileSlugs(mockDashboard);

            expect(result?.dateZoomConfig?.tileTargets).toEqual({
                'slug-1': {
                    controlUuid: 'control-1',
                    fieldId: 'orders_order_date',
                    tableName: 'orders',
                },
            });
            // controls are untouched
            expect(result?.dateZoomConfig?.controls).toEqual(
                mockDashboard.config.dateZoomConfig.controls,
            );
        });

        it('should drop tileTargets whose tile UUID no longer exists', () => {
            const mockDashboard = {
                config: {
                    isDateZoomDisabled: false,
                    dateZoomConfig: {
                        controls: [
                            {
                                uuid: 'control-1',
                                name: 'Revenue zoom',
                                granularity: 'WEEK',
                            },
                        ],
                        tileTargets: {
                            'orphaned-uuid': {
                                controlUuid: 'control-1',
                                fieldId: 'orders_order_date',
                                tableName: 'orders',
                            },
                        },
                    },
                },
                tiles: [],
            } as AnyType;

            const result =
                CoderService.getConfigWithDateZoomTileSlugs(mockDashboard);

            expect(result?.dateZoomConfig?.tileTargets).toEqual({});
        });

        it('should return config unchanged when there is no dateZoomConfig', () => {
            const mockDashboard = {
                config: { isDateZoomDisabled: false },
                tiles: [],
            } as AnyType;

            const result =
                CoderService.getConfigWithDateZoomTileSlugs(mockDashboard);

            expect(result).toEqual({ isDateZoomDisabled: false });
        });

        it('should return undefined when there is no config', () => {
            const mockDashboard = { tiles: [] } as AnyType;

            expect(
                CoderService.getConfigWithDateZoomTileSlugs(mockDashboard),
            ).toBeUndefined();
        });
    });

    describe('getConfigWithDateZoomTileUuids', () => {
        const tilesWithUuids = [
            {
                uuid: 'uuid-1',
                type: DashboardTileTypes.SAVED_CHART,
                properties: { chartSlug: 'slug-1' },
            },
            {
                uuid: 'uuid-2',
                type: DashboardTileTypes.SAVED_CHART,
                properties: { chartSlug: 'slug-2' },
            },
        ];

        it('should convert date zoom tileTargets tile slugs to UUIDs', () => {
            const config = {
                isDateZoomDisabled: false,
                dateZoomConfig: {
                    controls: [
                        {
                            uuid: 'control-1',
                            name: 'Revenue zoom',
                            granularity: 'WEEK',
                        },
                    ],
                    tileTargets: {
                        'slug-1': {
                            controlUuid: 'control-1',
                            fieldId: 'orders_order_date',
                            tableName: 'orders',
                        },
                    },
                },
            };

            const result = CoderService.getConfigWithDateZoomTileUuids(
                config as AnyType,
                tilesWithUuids as AnyType,
            );

            expect(result.dateZoomConfig?.tileTargets).toEqual({
                'uuid-1': {
                    controlUuid: 'control-1',
                    fieldId: 'orders_order_date',
                    tableName: 'orders',
                },
            });
        });

        it('should log an error and skip a target whose slug does not match a tile', () => {
            console.error = jest.fn();

            const config = {
                isDateZoomDisabled: false,
                dateZoomConfig: {
                    controls: [],
                    tileTargets: {
                        'slug-1': {
                            controlUuid: 'control-1',
                            fieldId: 'f1',
                            tableName: 'orders',
                        },
                        'missing-slug': {
                            controlUuid: 'control-1',
                            fieldId: 'f2',
                            tableName: 'orders',
                        },
                    },
                },
            };

            const result = CoderService.getConfigWithDateZoomTileUuids(
                config as AnyType,
                tilesWithUuids as AnyType,
            );

            expect(console.error).toHaveBeenCalledWith(
                'Tile with slug missing-slug not found for date zoom target',
            );
            expect(result.dateZoomConfig?.tileTargets).toEqual({
                'uuid-1': {
                    controlUuid: 'control-1',
                    fieldId: 'f1',
                    tableName: 'orders',
                },
            });
        });

        it('should return config unchanged when there is no dateZoomConfig', () => {
            const config = { isDateZoomDisabled: false };

            const result = CoderService.getConfigWithDateZoomTileUuids(
                config as AnyType,
                tilesWithUuids as AnyType,
            );

            expect(result).toEqual({ isDateZoomDisabled: false });
        });
    });

    describe('date zoom config round-trip', () => {
        it('should preserve tileTargets through download then upload', () => {
            // Download: a saved dashboard keyed by the original tile UUID
            const mockDashboard = {
                config: {
                    isDateZoomDisabled: false,
                    dateZoomConfig: {
                        controls: [
                            {
                                uuid: 'control-1',
                                name: 'Revenue zoom',
                                granularity: 'WEEK',
                            },
                        ],
                        tileTargets: {
                            'original-uuid': {
                                controlUuid: 'control-1',
                                fieldId: 'orders_order_date',
                                tableName: 'orders',
                            },
                        },
                    },
                },
                tiles: [
                    {
                        uuid: 'original-uuid',
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: { chartSlug: 'revenue-over-time' },
                    },
                ],
            } as AnyType;

            const asCodeConfig =
                CoderService.getConfigWithDateZoomTileSlugs(mockDashboard);

            // As-code is keyed by slug, not the ephemeral tile UUID
            expect(
                Object.keys(asCodeConfig?.dateZoomConfig?.tileTargets ?? {}),
            ).toEqual(['revenue-over-time']);

            // Upload: the tile is re-created with a brand new UUID
            const tilesWithNewUuids = [
                {
                    uuid: 'regenerated-uuid',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { chartSlug: 'revenue-over-time' },
                },
            ];

            const restoredConfig = CoderService.getConfigWithDateZoomTileUuids(
                asCodeConfig as AnyType,
                tilesWithNewUuids as AnyType,
            );

            // The target is re-attached to the new tile UUID, not lost
            expect(restoredConfig.dateZoomConfig?.tileTargets).toEqual({
                'regenerated-uuid': {
                    controlUuid: 'control-1',
                    fieldId: 'orders_order_date',
                    tableName: 'orders',
                },
            });
        });
    });

    describe('convertTileWithSlugsToUuids', () => {
        it('should allow chart tiles with null chartSlug', async () => {
            const service = new CoderService({
                analytics: {} as AnyType,
                contentVerificationModel: {} as AnyType,
                dashboardModel: {} as AnyType,
                lightdashConfig: {} as AnyType,
                projectModel: {} as AnyType,
                promoteService: {} as AnyType,
                savedChartModel: {
                    find: jest.fn(),
                } as AnyType,
                savedSqlModel: {
                    find: jest.fn(),
                } as AnyType,
                schedulerClient: {} as AnyType,
                spaceModel: {} as AnyType,
                spacePermissionService: {} as AnyType,
            });

            const result = await service.convertTileWithSlugsToUuids(
                'project-uuid',
                [
                    {
                        type: DashboardTileTypes.SAVED_CHART,
                        uuid: undefined,
                        tileSlug: undefined,
                        x: 0,
                        y: 0,
                        h: 2,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            chartSlug: null,
                            chartName: 'Deleted chart',
                        },
                    },
                    {
                        type: DashboardTileTypes.SQL_CHART,
                        uuid: undefined,
                        tileSlug: undefined,
                        x: 4,
                        y: 0,
                        h: 2,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            chartSlug: null,
                            chartName: 'Deleted SQL chart',
                        },
                    },
                ] as AnyType,
            );

            expect(result).toMatchObject([
                {
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {
                        chartSlug: null,
                        savedChartUuid: null,
                    },
                },
                {
                    type: DashboardTileTypes.SQL_CHART,
                    properties: {
                        chartSlug: null,
                        savedSqlUuid: null,
                    },
                },
            ]);
            expect(result[0].uuid).toEqual(expect.any(String));
            expect(result[1].uuid).toEqual(expect.any(String));
        });
    });
});
