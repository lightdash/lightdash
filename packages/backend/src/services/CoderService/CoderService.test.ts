// CoderService.test.ts
import {
    AnyType,
    DashboardDAO,
    DashboardFilterRule,
    DashboardTileTarget,
    DashboardTileTypes,
} from '@lightdash/common';
import { CoderService } from './CoderService';

describe('CoderService', () => {
    describe('dashboard chartSlug requirements', () => {
        it('should import a chart tile when chartSlug is present', async () => {
            const service = new CoderService({
                lightdashConfig: {} as AnyType,
                analytics: {} as AnyType,
                projectModel: {} as AnyType,
                savedChartModel: {
                    find: jest.fn().mockResolvedValue([
                        {
                            slug: 'orders-chart',
                            uuid: 'saved-chart-uuid',
                        },
                    ]),
                } as AnyType,
                savedSqlModel: {
                    find: jest.fn().mockResolvedValue([]),
                } as AnyType,
                dashboardModel: {} as AnyType,
                spaceModel: {} as AnyType,
                schedulerClient: {} as AnyType,
                promoteService: {} as AnyType,
                spacePermissionService: {} as AnyType,
                contentVerificationModel: {} as AnyType,
            });

            await expect(
                service.convertTileWithSlugsToUuids('project-1', [
                    {
                        uuid: undefined,
                        tileSlug: undefined,
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 4,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            title: 'Chart',
                            hideTitle: false,
                            chartSlug: 'orders-chart',
                            chartName: 'Orders',
                        },
                    } as AnyType,
                ]),
            ).resolves.toMatchObject([
                {
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {
                        chartSlug: 'orders-chart',
                        savedChartUuid: 'saved-chart-uuid',
                    },
                },
            ]);
        });

        it('should throw when exporting a dashboard with a chart tile missing chartSlug', () => {
            const dashboard = {
                uuid: 'dashboard-1',
                name: 'Dashboard',
                description: undefined,
                updatedAt: new Date('2024-01-01T00:00:00.000Z'),
                spaceUuid: 'space-1',
                slug: 'dashboard',
                tiles: [
                    {
                        uuid: 'tile-1',
                        x: 0,
                        y: 0,
                        h: 4,
                        w: 4,
                        tabUuid: null,
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: {
                            title: 'Chart',
                            hideTitle: false,
                            chartSlug: undefined,
                            chartName: 'Orders',
                        },
                    },
                ],
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                tabs: [],
            } as AnyType;

            expect(() =>
                (CoderService as AnyType).transformDashboard(
                    dashboard,
                    [{ uuid: 'space-1', name: 'Space', path: 'space' }],
                    new Map(),
                ),
            ).toThrow('Chart tile tile-1 is missing chartSlug');
        });

        it('should throw when importing a chart tile missing chartSlug', async () => {
            const service = new CoderService({
                lightdashConfig: {} as AnyType,
                analytics: {} as AnyType,
                projectModel: {} as AnyType,
                savedChartModel: { find: jest.fn() } as AnyType,
                savedSqlModel: { find: jest.fn() } as AnyType,
                dashboardModel: {} as AnyType,
                spaceModel: {} as AnyType,
                schedulerClient: {} as AnyType,
                promoteService: {} as AnyType,
                spacePermissionService: {} as AnyType,
                contentVerificationModel: {} as AnyType,
            });

            await expect(
                service.convertTileWithSlugsToUuids('project-1', [
                    {
                        uuid: undefined,
                        tileSlug: undefined,
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 4,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            title: 'Chart',
                            hideTitle: false,
                            chartSlug: undefined,
                            chartName: 'Orders',
                        },
                    } as AnyType,
                ]),
            ).rejects.toThrow('Chart tile is missing chartSlug');
        });

        it('should throw when importing a chart tile with null chartSlug', async () => {
            const service = new CoderService({
                lightdashConfig: {} as AnyType,
                analytics: {} as AnyType,
                projectModel: {} as AnyType,
                savedChartModel: { find: jest.fn() } as AnyType,
                savedSqlModel: { find: jest.fn() } as AnyType,
                dashboardModel: {} as AnyType,
                spaceModel: {} as AnyType,
                schedulerClient: {} as AnyType,
                promoteService: {} as AnyType,
                spacePermissionService: {} as AnyType,
                contentVerificationModel: {} as AnyType,
            });

            await expect(
                service.convertTileWithSlugsToUuids('project-1', [
                    {
                        uuid: undefined,
                        tileSlug: undefined,
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 4,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            title: 'Chart',
                            hideTitle: false,
                            chartSlug: null,
                            chartName: null,
                        },
                    } as AnyType,
                ]),
            ).rejects.toThrow('Chart tile is missing chartSlug');
        });

        it('should import a sql chart tile when chartSlug is present', async () => {
            const service = new CoderService({
                lightdashConfig: {} as AnyType,
                analytics: {} as AnyType,
                projectModel: {} as AnyType,
                savedChartModel: {
                    find: jest.fn().mockResolvedValue([]),
                } as AnyType,
                savedSqlModel: {
                    find: jest.fn().mockResolvedValue([
                        {
                            slug: 'orders-sql-chart',
                            saved_sql_uuid: 'saved-sql-uuid',
                        },
                    ]),
                } as AnyType,
                dashboardModel: {} as AnyType,
                spaceModel: {} as AnyType,
                schedulerClient: {} as AnyType,
                promoteService: {} as AnyType,
                spacePermissionService: {} as AnyType,
                contentVerificationModel: {} as AnyType,
            });

            await expect(
                service.convertTileWithSlugsToUuids('project-1', [
                    {
                        uuid: undefined,
                        tileSlug: undefined,
                        type: DashboardTileTypes.SQL_CHART,
                        x: 0,
                        y: 0,
                        h: 4,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            title: 'SQL chart',
                            hideTitle: false,
                            chartSlug: 'orders-sql-chart',
                            chartName: 'Orders SQL',
                        },
                    } as AnyType,
                ]),
            ).resolves.toMatchObject([
                {
                    type: DashboardTileTypes.SQL_CHART,
                    properties: {
                        chartSlug: 'orders-sql-chart',
                        savedSqlUuid: 'saved-sql-uuid',
                    },
                },
            ]);
        });

        it('should import non-chart tiles without querying chart models', async () => {
            const savedChartFind = jest.fn();
            const savedSqlFind = jest.fn();
            const service = new CoderService({
                lightdashConfig: {} as AnyType,
                analytics: {} as AnyType,
                projectModel: {} as AnyType,
                savedChartModel: {
                    find: savedChartFind,
                } as AnyType,
                savedSqlModel: {
                    find: savedSqlFind,
                } as AnyType,
                dashboardModel: {} as AnyType,
                spaceModel: {} as AnyType,
                schedulerClient: {} as AnyType,
                promoteService: {} as AnyType,
                spacePermissionService: {} as AnyType,
                contentVerificationModel: {} as AnyType,
            });

            const result = await service.convertTileWithSlugsToUuids(
                'project-1',
                [
                    {
                        uuid: undefined,
                        tileSlug: undefined,
                        type: DashboardTileTypes.MARKDOWN,
                        x: 0,
                        y: 0,
                        h: 4,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            title: 'Note',
                            content: 'Hello',
                        },
                    },
                    {
                        uuid: undefined,
                        tileSlug: undefined,
                        type: DashboardTileTypes.HEADING,
                        x: 4,
                        y: 0,
                        h: 2,
                        w: 4,
                        tabUuid: null,
                        properties: {
                            text: 'Section',
                        },
                    },
                ] as AnyType,
            );

            expect(savedChartFind).not.toHaveBeenCalled();
            expect(savedSqlFind).not.toHaveBeenCalled();
            expect(result).toMatchObject([
                {
                    type: DashboardTileTypes.MARKDOWN,
                    properties: {
                        title: 'Note',
                        content: 'Hello',
                    },
                },
                {
                    type: DashboardTileTypes.HEADING,
                    properties: {
                        text: 'Section',
                    },
                },
            ]);
            expect(result[0].uuid).toBeDefined();
            expect(result[1].uuid).toBeDefined();
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
});
