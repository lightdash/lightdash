import {
    DashboardControlRefKind,
    FilterOperator,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardParameterControl,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    dashboardEditActions,
    dashboardParametersActions,
} from '../../../../../features/dashboard/store';
import { createDashboardTestStore } from '../../../../../testing/dashboardStore';
import {
    buildEmbedDashboardUpdate,
    getEmbedControlDrafts,
    haveEmbedControlsChanged,
    type EmbedControlDrafts,
} from './embedDashboardSave';

const rule = (id: string, extra: Partial<DashboardFilterRule> = {}) =>
    ({
        id,
        label: undefined,
        operator: FilterOperator.EQUALS,
        target: { fieldId: `orders_${id}`, tableName: 'orders' },
        values: ['x'],
        ...extra,
    }) as DashboardFilterRule;

const regionControl = (value: string | null): DashboardParameterControl => ({
    id: 'region-control',
    label: 'Region',
    value,
    valueType: { type: 'string', multiple: false },
    parameters: { region: 'all' },
});

const savedZoom = {
    controls: [{ uuid: 'z1', name: 'Revenue zoom', granularity: 'Week' }],
    tileTargets: {
        t1: { controlUuid: 'z1', fieldId: 'orders_date', tableName: 'orders' },
    },
};

const dashboard = {
    filters: {
        dimensions: [rule('status', { label: 'Status' })],
        metrics: [],
        tableCalculations: [],
    },
    config: {
        isDateZoomDisabled: true,
        isAddFilterDisabled: false,
        pinnedParameters: ['region'],
        parameterOrder: ['region'],
        dateZoomGranularities: ['Day', 'Week'],
        defaultDateZoomGranularity: 'Week',
        dateZoomConfig: savedZoom,
        requiredFiltersNote: 'Pick a status',
        controlSections: [{ id: 'a', name: 'Dates' }],
        parameterControls: [regionControl('emea')],
    },
    parameters: { region: { parameterName: 'region', value: 'emea' } },
} as unknown as Pick<Dashboard, 'filters' | 'config' | 'parameters'>;

const storeFilters = {
    dimensions: [
        rule('status', { label: 'Estado', required: true }),
        rule('city'),
    ],
    metrics: [],
    tableCalculations: [],
};

const base = {
    dashboard,
    name: 'Sales',
    tiles: [],
    tabs: [],
    filters: storeFilters,
    filterLabelOverrides: { labels: { Status: 'Estado' } },
    isAddFilterDisabled: true,
    isDateZoomDisabled: null,
} as unknown as Omit<
    Parameters<typeof buildEmbedDashboardUpdate>[0],
    'controlDrafts'
>;

// The store as an embed has it: nothing staged, the saved controls seeded
const unchangedDrafts: EmbedControlDrafts = {
    controlOrder: undefined,
    hasControlOrderChanged: false,
    controlSections: [{ id: 'a', name: 'Dates' }],
    haveControlSectionsChanged: false,
    parameterControls: [regionControl('emea')],
    areParameterControlsSaved: true,
    haveParameterControlsChanged: false,
    parameterPicks: {},
    dateZoomConfig: savedZoom,
    hasDateZoomConfigChanged: false,
    dateZoomGranularities: ['Day', 'Week'],
    haveDateZoomGranularitiesChanged: false,
    defaultDateZoomGranularity: 'Week',
    hasDefaultDateZoomGranularityChanged: false,
    requiredFiltersNote: 'Pick a status',
};

describe('buildEmbedDashboardUpdate', () => {
    it('sends the save as it was before the controls, with them off', () => {
        expect(
            buildEmbedDashboardUpdate({ ...base, controlDrafts: null }),
        ).toEqual({
            tiles: [],
            filters: {
                // Raw rules, the translated label put back
                dimensions: [
                    rule('status', { label: 'Status', required: true }),
                    rule('city'),
                ],
                metrics: [],
                tableCalculations: [],
            },
            name: 'Sales',
            tabs: [],
            config: {
                ...dashboard.config,
                isDateZoomDisabled: true,
                isAddFilterDisabled: true,
            },
            parameters: dashboard.parameters,
        });
    });

    it('carries the loaded config through an unrelated save with the controls on', () => {
        const update = buildEmbedDashboardUpdate({
            ...base,
            controlDrafts: unchangedDrafts,
        });
        // The whole payload: nothing beyond the loaded config is written,
        // and no order until the editor reorders
        expect(update).toEqual({
            tiles: [],
            filters: {
                dimensions: [
                    rule('status', { label: 'Status', required: true }),
                    rule('city'),
                ],
                metrics: [],
                tableCalculations: [],
            },
            name: 'Sales',
            tabs: [],
            config: {
                ...dashboard.config,
                isAddFilterDisabled: true,
            },
            parameters: dashboard.parameters,
        });
    });

    it('keeps the keys the embed store never holds as loaded', () => {
        const update = buildEmbedDashboardUpdate({
            ...base,
            controlDrafts: {
                ...unchangedDrafts,
                haveControlSectionsChanged: true,
                controlSections: [],
            },
        });
        expect(update).toMatchObject({
            config: {
                isDateZoomDisabled: true,
                pinnedParameters: ['region'],
                parameterOrder: ['region'],
                controlSections: [],
            },
        });
    });

    it("sends the editor's date zoom visibility where the store holds it", () => {
        const untouched = buildEmbedDashboardUpdate({
            ...base,
            isDateZoomDisabled: true,
            controlDrafts: unchangedDrafts,
        });
        expect(untouched).toMatchObject({
            config: { isDateZoomDisabled: true },
        });
        const toggled = buildEmbedDashboardUpdate({
            ...base,
            isDateZoomDisabled: false,
            controlDrafts: unchangedDrafts,
        });
        expect(toggled).toMatchObject({
            config: { isDateZoomDisabled: false, pinnedParameters: ['region'] },
        });
    });

    it('keeps an absent pinned list absent', () => {
        const update = buildEmbedDashboardUpdate({
            ...base,
            dashboard: {
                ...dashboard,
                config: { isDateZoomDisabled: false },
            },
            controlDrafts: { ...unchangedDrafts, parameterControls: null },
        });
        expect(
            'config' in update ? update.config?.pinnedParameters : null,
        ).toBeUndefined();
    });

    it('writes the changed controls, and the parameters as their mirror', () => {
        const zoom = {
            controls: [
                ...savedZoom.controls,
                { uuid: 'z2', name: 'Orders zoom', granularity: 'Month' },
            ],
            tileTargets: {
                ...savedZoom.tileTargets,
                t2: {
                    controlUuid: 'z2',
                    fieldId: 'orders_date',
                    tableName: 'orders',
                },
            },
        };
        const order = [
            { kind: DashboardControlRefKind.FILTER, id: 'city' },
            { kind: DashboardControlRefKind.FILTER, id: 'status' },
        ];
        const update = buildEmbedDashboardUpdate({
            ...base,
            controlDrafts: {
                ...unchangedDrafts,
                controlOrder: order,
                hasControlOrderChanged: true,
                controlSections: [{ id: 'b', name: 'People' }],
                haveControlSectionsChanged: true,
                parameterControls: [regionControl('apac')],
                haveParameterControlsChanged: true,
                dateZoomConfig: zoom,
                hasDateZoomConfigChanged: true,
                dateZoomGranularities: ['Month'],
                haveDateZoomGranularitiesChanged: true,
                defaultDateZoomGranularity: 'Month',
                hasDefaultDateZoomGranularityChanged: true,
                requiredFiltersNote: 'Pick a city',
            } as EmbedControlDrafts,
        });
        expect(update).toMatchObject({
            config: {
                parameterControls: [regionControl('apac')],
                dateZoomConfig: zoom,
                dateZoomGranularities: ['Month'],
                defaultDateZoomGranularity: 'Month',
                requiredFiltersNote: 'Pick a city',
                controlSections: [{ id: 'b', name: 'People' }],
            },
            parameters: { region: { parameterName: 'region', value: 'apac' } },
        });
        if (!('config' in update) || !('filters' in update)) {
            throw new Error('Expected a versioned update');
        }
        const savedOrder = update.config?.controlOrder ?? [];
        expect(savedOrder.slice(0, 2)).toMatchObject(order);
        // Every control is in the order, and the rules follow it
        expect(savedOrder.map(({ id }) => id)).toEqual(
            expect.arrayContaining(['region-control', 'z1', 'z2', 'b']),
        );
        expect(update.filters?.dimensions.map(({ id }) => id)).toEqual([
            'city',
            'status',
        ]);
        // A required filter keeps its value as its default, its label restored
        expect(update.filters?.dimensions[1]).toMatchObject({
            label: 'Status',
            values: ['x'],
        });
    });
});

describe('embed control drafts', () => {
    it('reads no change from a store nothing was staged in', () => {
        const store = createDashboardTestStore();
        const drafts = getEmbedControlDrafts(
            store.getState(),
            dashboard.config,
        );
        expect(drafts).toMatchObject({
            dateZoomConfig: savedZoom,
            dateZoomGranularities: ['Day', 'Week'],
            defaultDateZoomGranularity: 'Week',
            requiredFiltersNote: 'Pick a status',
        });
        expect(haveEmbedControlsChanged(dashboard, drafts)).toBe(false);
    });

    it.each([
        [
            'a section change',
            dashboardEditActions.setHaveControlSectionsChanged(true),
        ],
        ['a reorder', dashboardEditActions.setHasControlOrderChanged(true)],
        [
            'a parameter control change',
            dashboardParametersActions.setHaveParameterControlsChanged(true),
        ],
        ['a new note', dashboardEditActions.setRequiredFiltersNote('Other')],
        [
            'a date zoom change',
            dashboardEditActions.setDateZoomConfig({
                value: { controls: [], tileTargets: {} },
                changed: true,
                saved: savedZoom,
            } as Parameters<typeof dashboardEditActions.setDateZoomConfig>[0]),
        ],
    ])('enables Save on %s', (_name, action) => {
        const store = createDashboardTestStore();
        store.dispatch(action);
        expect(
            haveEmbedControlsChanged(
                dashboard,
                getEmbedControlDrafts(store.getState(), dashboard.config),
            ),
        ).toBe(true);
    });
});
