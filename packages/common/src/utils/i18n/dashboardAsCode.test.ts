import { type DashboardAsCode } from '../../types/coder';
import { DashboardTileTypes } from '../../types/dashboard';
import { FilterOperator } from '../../types/filter';
import { DateGranularity } from '../../types/timeFrames';
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

const dashboardWithControls: DashboardAsCode = {
    ...dashboardAsCode,
    config: {
        isDateZoomDisabled: true,
        controlSections: [
            { slug: 'dates', name: 'Dates' },
            { slug: 'region', name: 'Region' },
        ],
        parameterControls: [
            {
                slug: 'currency',
                label: 'Currency',
                value: 'usd',
                valueType: { type: 'string', multiple: false },
                parameters: { currency: 'all' },
            },
        ],
        dateZoomConfig: {
            controls: [
                {
                    uuid: 'zoom-1',
                    name: 'Revenue zoom',
                    granularity: DateGranularity.WEEK,
                },
            ],
            tileTargets: {},
        },
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

        it('should emit control names keyed by source name, never by position', () => {
            const languageMap =
                new DashboardAsCodeInternalization().getLanguageMap(
                    dashboardWithControls,
                ).dashboard[dashboardAsCode.slug];

            expect(languageMap.sections).toEqual({
                names: { Dates: 'Dates', Region: 'Region' },
            });
            expect(languageMap.parameterControls).toEqual({
                labels: { Currency: 'Currency' },
            });
            expect(languageMap.dateZooms).toEqual({
                names: { 'Revenue zoom': 'Revenue zoom' },
            });
            expect(languageMap).not.toHaveProperty('config');
        });

        it('should emit no control blocks when the dashboard has no such controls', () => {
            const languageMap =
                new DashboardAsCodeInternalization().getLanguageMap({
                    ...dashboardAsCode,
                    config: {
                        isDateZoomDisabled: false,
                        controlSections: [],
                        // Takes its parameter's label
                        parameterControls: [
                            {
                                ...dashboardWithControls.config!
                                    .parameterControls![0],
                                label: null,
                            },
                        ],
                        dateZoomConfig: { controls: [], tileTargets: {} },
                    },
                }).dashboard[dashboardAsCode.slug];

            expect(languageMap).not.toHaveProperty('sections');
            expect(languageMap).not.toHaveProperty('parameterControls');
            expect(languageMap).not.toHaveProperty('dateZooms');
            expect(languageMap).not.toHaveProperty('config');
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

        it('should keep each control translation when the controls are reordered', () => {
            const config = dashboardWithControls.config!;
            const merged = new DashboardAsCodeInternalization().merge(
                {
                    filters: undefined,
                    sections: { names: { Dates: 'Fechas', Region: 'Región' } },
                    parameterControls: { labels: { Currency: 'Moneda' } },
                    dateZooms: {
                        names: { 'Revenue zoom': 'Zoom de ingresos' },
                    },
                },
                {
                    ...structuredClone(dashboardWithControls),
                    config: {
                        ...config,
                        controlSections: [...config.controlSections!].reverse(),
                    },
                },
            );

            expect(merged.config?.controlSections).toEqual([
                { slug: 'region', name: 'Región' },
                { slug: 'dates', name: 'Fechas' },
            ]);
            expect(merged.config?.parameterControls).toEqual([
                { ...config.parameterControls![0], label: 'Moneda' },
            ]);
            expect(merged.config?.dateZoomConfig).toEqual({
                ...config.dateZoomConfig,
                controls: [
                    {
                        ...config.dateZoomConfig!.controls[0],
                        name: 'Zoom de ingresos',
                    },
                ],
            });
            expect(merged.config?.isDateZoomDisabled).toBe(true);
        });

        it('should leave control names without a translation untouched', () => {
            const merged = new DashboardAsCodeInternalization().merge(
                {
                    filters: undefined,
                    sections: { names: { Dates: 'Fechas', Other: 'Otro' } },
                },
                structuredClone(dashboardWithControls),
            );

            expect(merged.config).toEqual({
                ...dashboardWithControls.config,
                controlSections: [
                    { slug: 'dates', name: 'Fechas' },
                    { slug: 'region', name: 'Region' },
                ],
            });
        });

        it('should ignore the positional section names of an older map', () => {
            const olderMap = {
                filters: undefined,
                config: { controlSections: [{ name: 'Dates FR' }] },
            };
            const merged = new DashboardAsCodeInternalization().merge(
                olderMap,
                structuredClone(dashboardWithControls),
            );

            expect(merged.config).toEqual(dashboardWithControls.config);
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
