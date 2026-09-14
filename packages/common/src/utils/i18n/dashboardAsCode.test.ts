import { type DashboardAsCode } from '../../types/coder';
import { DashboardTileTypes } from '../../types/dashboard';
import { FilterOperator } from '../../types/filter';
import { DashboardAsCodeInternalization } from './dashboardAsCode';

const dashboardAsCode: DashboardAsCode = {
    name: 'Sales overview',
    description: undefined,
    slug: 'sales-overview',
    spaceSlug: 'shared',
    version: 1,
    tabs: [
        {
            slug: 'overview',
            name: 'Overview',
            order: 0,
        },
        {
            slug: 'details',
            name: 'Details',
            order: 1,
            hidden: true,
        },
    ],
    tiles: [
        {
            uuid: undefined,
            tileSlug: undefined,
            type: DashboardTileTypes.MARKDOWN,
            x: 0,
            y: 0,
            h: 3,
            w: 9,
            properties: { title: 'Notes', content: 'Some content' },
        },
    ],
    filters: {
        dimensions: [
            {
                label: 'Regio klant',
                target: {
                    fieldId: 'customers_region',
                    tableName: 'customers',
                },
                operator: FilterOperator.EQUALS,
                values: [],
                tileTargets: {},
            },
            {
                label: undefined,
                target: { fieldId: 'orders_status', tableName: 'orders' },
                operator: FilterOperator.EQUALS,
                values: [],
                tileTargets: {},
            },
        ],
        metrics: [
            {
                id: 'metric-filter-1',
                label: 'Totale omzet',
                target: { fieldId: 'orders_total', tableName: 'orders' },
                operator: FilterOperator.GREATER_THAN,
                values: [0],
                tileTargets: {},
            },
        ],
        tableCalculations: [],
    },
};

describe('DashboardAsCodeInternalization', () => {
    describe('getLanguageMap', () => {
        it('should emit user-defined filter labels keyed by source label', () => {
            const languageMap =
                new DashboardAsCodeInternalization().getLanguageMap(
                    dashboardAsCode,
                ).dashboard[dashboardAsCode.slug];

            expect(languageMap.name).toBe('Sales overview');
            expect(languageMap.filters).toEqual({
                labels: {
                    'Regio klant': 'Regio klant',
                    'Totale omzet': 'Totale omzet',
                },
            });
        });

        it('should emit tab names in positional order', () => {
            const languageMap =
                new DashboardAsCodeInternalization().getLanguageMap(
                    dashboardAsCode,
                ).dashboard[dashboardAsCode.slug];

            expect(languageMap.tabs).toEqual([
                { name: 'Overview' },
                { name: 'Details' },
            ]);
        });

        it('should handle a dashboard without filters', () => {
            const { filters, ...dashboardWithoutFilters } = dashboardAsCode;

            const languageMap =
                new DashboardAsCodeInternalization().getLanguageMap(
                    dashboardWithoutFilters,
                ).dashboard[dashboardAsCode.slug];

            expect(languageMap.filters).toBeUndefined();
        });

        it('should omit filters when no rule has a user-defined label', () => {
            const languageMap =
                new DashboardAsCodeInternalization().getLanguageMap({
                    ...dashboardAsCode,
                    filters: {
                        dimensions: [
                            {
                                ...dashboardAsCode.filters!.dimensions![0],
                                label: undefined,
                            },
                        ],
                        metrics: [],
                        tableCalculations: [],
                    },
                }).dashboard[dashboardAsCode.slug];

            expect(languageMap.filters).toBeUndefined();
        });
    });

    describe('merge', () => {
        it('should translate filter labels by source label without touching other rule fields', () => {
            const merged = new DashboardAsCodeInternalization().merge(
                {
                    filters: {
                        labels: {
                            'Regio klant': 'Région client',
                            'Totale omzet': "Chiffre d'affaires",
                        },
                    },
                },
                structuredClone(dashboardAsCode),
            );

            expect(merged.filters?.dimensions?.[0]).toMatchObject({
                label: 'Région client',
                operator: FilterOperator.EQUALS,
                target: {
                    fieldId: 'customers_region',
                    tableName: 'customers',
                },
            });
            expect(merged.filters?.dimensions?.[1]?.label).toBeUndefined();
            expect(merged.filters?.metrics?.[0]).toMatchObject({
                id: 'metric-filter-1',
                label: "Chiffre d'affaires",
            });
        });

        it('should leave labels without a translation entry untouched', () => {
            const merged = new DashboardAsCodeInternalization().merge(
                { filters: { labels: { 'Some other label': 'Autre' } } },
                structuredClone(dashboardAsCode),
            );

            expect(merged.filters?.dimensions?.[0]?.label).toBe('Regio klant');
            expect(merged.filters?.metrics?.[0]?.label).toBe('Totale omzet');
        });

        it('should still merge non-filter content alongside filter labels', () => {
            const merged = new DashboardAsCodeInternalization().merge(
                {
                    name: 'Aperçu des ventes',
                    filters: { labels: { 'Regio klant': 'Région client' } },
                },
                structuredClone(dashboardAsCode),
            );

            expect(merged.name).toBe('Aperçu des ventes');
            expect(merged.filters?.dimensions?.[0]?.label).toBe(
                'Région client',
            );
        });

        it('should merge translated tab names by position without touching other tab fields', () => {
            const merged = new DashboardAsCodeInternalization().merge(
                {
                    tabs: [{ name: 'Vue d’ensemble' }, { name: 'Détails' }],
                    filters: undefined,
                },
                structuredClone(dashboardAsCode),
            );

            expect(merged.tabs).toEqual([
                {
                    slug: 'overview',
                    name: 'Vue d’ensemble',
                    order: 0,
                },
                {
                    slug: 'details',
                    name: 'Détails',
                    order: 1,
                    hidden: true,
                },
            ]);
        });
    });
});
