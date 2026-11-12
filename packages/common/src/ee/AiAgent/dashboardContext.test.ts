import { DateGranularity, FilterOperator, type DashboardFilters } from '../..';
import {
    getAiDashboardDateZoomControls,
    getAiDashboardTileParameters,
    serializeDashboardDateZoomControlsForAiContext,
    serializeDashboardFiltersForAiContext,
    serializeDashboardTileParametersForAiContext,
} from './dashboardContext';

const filter = {
    id: 'filter-uuid',
    label: 'Country',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders.country', tableName: 'orders' },
    values: ['US'],
    tileTargets: {
        'tile-uuid': { fieldId: 'orders.country', tableName: 'orders' },
    },
    lockedTabUuids: ['tab-uuid'],
    requiredGroupId: 'group-uuid',
};

describe('serializeDashboardFiltersForAiContext', () => {
    it('removes opaque identifiers from every filter group', () => {
        const filters: DashboardFilters = {
            dimensions: [filter],
            metrics: [filter],
            tableCalculations: [filter],
        };

        expect(serializeDashboardFiltersForAiContext(filters)).toEqual({
            dimensions: [
                {
                    label: 'Country',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'orders.country',
                        tableName: 'orders',
                    },
                    values: ['US'],
                },
            ],
            metrics: [
                {
                    label: 'Country',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'orders.country',
                        tableName: 'orders',
                    },
                    values: ['US'],
                },
            ],
            tableCalculations: [
                {
                    label: 'Country',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'orders.country',
                        tableName: 'orders',
                    },
                    values: ['US'],
                },
            ],
        });
    });
});

const tiles = [
    { uuid: 'tile-1', name: 'Revenue' },
    { uuid: 'tile-2', name: 'Orders' },
    { uuid: 'tile-3', name: 'Signups' },
];

describe('getAiDashboardDateZoomControls', () => {
    it('is absent for a dashboard with no named date zoom', () => {
        expect(
            getAiDashboardDateZoomControls({
                config: { controls: [], tileTargets: {} },
                runtimeGranularities: {},
                tiles,
            }),
        ).toBeUndefined();
    });

    it("gives each control the viewer's pick, else its saved grain, with its tiles", () => {
        const controls = getAiDashboardDateZoomControls({
            config: {
                controls: [
                    {
                        uuid: 'zoom-1',
                        name: 'Revenue zoom',
                        granularity: DateGranularity.MONTH,
                    },
                    {
                        uuid: 'zoom-2',
                        name: 'Growth zoom',
                        granularity: DateGranularity.QUARTER,
                    },
                ],
                tileTargets: {
                    'tile-1': {
                        controlUuid: 'zoom-1',
                        fieldId: 'orders.date',
                        tableName: 'orders',
                    },
                    'tile-3': {
                        controlUuid: 'zoom-2',
                        fieldId: null,
                        tableName: null,
                    },
                },
            },
            runtimeGranularities: { 'zoom-1': DateGranularity.WEEK },
            tiles,
        });

        expect(controls).toEqual([
            {
                uuid: 'zoom-1',
                name: 'Revenue zoom',
                granularity: DateGranularity.WEEK,
                tiles: [tiles[0]],
            },
            {
                uuid: 'zoom-2',
                name: 'Growth zoom',
                granularity: DateGranularity.QUARTER,
                tiles: [tiles[2]],
            },
        ]);
        expect(
            serializeDashboardDateZoomControlsForAiContext(controls!),
        ).toEqual([
            {
                name: 'Revenue zoom',
                granularity: DateGranularity.WEEK,
                tiles: ['Revenue'],
            },
            {
                name: 'Growth zoom',
                granularity: DateGranularity.QUARTER,
                tiles: ['Signups'],
            },
        ]);
    });
});

describe('getAiDashboardTileParameters', () => {
    it('is absent without parameter controls', () => {
        expect(
            getAiDashboardTileParameters({
                tiles,
                parametersByTileUuid: undefined,
            }),
        ).toBeUndefined();
    });

    it('lists the values of each tile once tiles differ', () => {
        const tileParameters = getAiDashboardTileParameters({
            tiles,
            parametersByTileUuid: {
                'tile-1': { region: 'EU' },
                'tile-2': { region: 'US' },
                'tile-3': { region: 'EU' },
            },
        });

        expect(tileParameters).toEqual([
            { tile: tiles[0], parameters: { region: 'EU' } },
            { tile: tiles[1], parameters: { region: 'US' } },
            { tile: tiles[2], parameters: { region: 'EU' } },
        ]);
        expect(
            serializeDashboardTileParametersForAiContext(tileParameters!),
        ).toEqual([
            { tiles: ['Revenue', 'Signups'], parameters: { region: 'EU' } },
            { tiles: ['Orders'], parameters: { region: 'US' } },
        ]);
    });

    it('leaves out tiles no control gives a value', () => {
        expect(
            getAiDashboardTileParameters({
                tiles,
                parametersByTileUuid: { 'tile-1': { region: 'EU' } },
            }),
        ).toEqual([{ tile: tiles[0], parameters: { region: 'EU' } }]);
    });
});
