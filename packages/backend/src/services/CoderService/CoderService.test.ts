// CoderService.test.ts
import {
    AnyType,
    DashboardAsCode,
    DashboardChartTileProperties,
    DashboardDAO,
    DashboardFilterRule,
    DashboardTile,
    DashboardTileTarget,
} from '@lightdash/common';
import { CoderService } from './CoderService';

describe('CoderService.getFiltersWithTileSlugs', () => {
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
                { uuid: 'uuid-1', properties: { chartSlug: 'slug-1' } },
                { uuid: 'uuid-2', properties: { chartSlug: 'slug-2' } },
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

/*

describe('CoderService', () => {
    describe('getFiltersWithTileUuids', () => {
        it('should convert tile slugs to UUIDs in filters', () => {
            const dashboardAsCode = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'chart-slug-1': { someTargetProperty: 'value1' },
                                'chart-slug-2': { someTargetProperty: 'value2' },
                            },
                        },
                     ],
                } ,
                // ... other properties
            };

            const tilesWithUuids = [
                { uuid: 'uuid-1', properties: { chartSlug: 'chart-slug-1' } },
                { uuid: 'uuid-2', properties: { chartSlug: 'chart-slug-2' } },
            ];

            const result = CoderService.getFiltersWithTileUuids(dashboardAsCode as AnyType, tilesWithUuids as AnyType);

            expect(result.dimensions[0].tileTargets).toEqual({
                'uuid-1': { someTargetProperty: 'value1' },
                'uuid-2': { someTargetProperty: 'value2' },
            });
            expect(result.dimensions[0].id).toBe('mock-uuid');
        });

        it('should log an error if a tile slug does not match any UUID', () => {
            console.error = jest.fn();

            const dashboardAsCode = {
                filters: {
                    dimensions: [
                        {
                            tileTargets: {
                                'chart-slug-3': { someTargetProperty: 'value3' },
                            },
                        },
                    ],
                },
                // ... other properties
            };

            const tilesWithUuids= [
                { uuid: 'uuid-1', properties: { chartSlug: 'chart-slug-1' } },
                { uuid: 'uuid-2', properties: { chartSlug: 'chart-slug-2' } },
            ];

            const result = CoderService.getFiltersWithTileUuids(dashboardAsCode as AnyType, tilesWithUuids as AnyType);

            expect(console.error).toHaveBeenCalledWith('Tile with slug chart-slug-3 not found in tilesWithUuids');
            expect(result.dimensions[0].tileTargets).toEqual({});
        });
    });
}); */
