import {
    DashboardControlRefKind,
    MetricType,
    type AdditionalMetric,
    type DashboardConfig,
    type DashboardParameterControl,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildDashboardConfig, getParametersToSave } from './dashboardConfig';

const customMetric = (name: string): AdditionalMetric => ({
    name,
    label: name,
    table: 'orders',
    sql: '${TABLE}.amount',
    type: MetricType.SUM,
});

const control = (
    id: string,
    value: string | null,
    parameters: string[],
): DashboardParameterControl => ({
    id,
    label: id,
    value,
    valueType: { type: 'string', multiple: false },
    parameters: Object.fromEntries(
        parameters.map((key) => [key, 'all' as const]),
    ),
});
const region = (value: string | null) =>
    control('region-control', value, ['region']);
const regionList = (value: string | null) => [region(value)];
// A second control on another key
const twoKeyList = (
    regionValue: string | null,
    weekStartValue: string | null,
) => [region(regionValue), control('other', weekStartValue, ['week_start'])];

const baseArgs = {
    existingConfig: undefined as DashboardConfig | undefined,
    isDateZoomDisabled: false,
    isAddFilterDisabled: false,
    pinnedParameters: [],
    parameterOrder: [],
    hasParameterOrderChanged: false,
    dateZoomGranularities: [],
    haveDateZoomGranularitiesChanged: false,
    defaultDateZoomGranularity: undefined,
    hasDefaultDateZoomGranularityChanged: false,
    dateZoomConfig: { controls: [], tileTargets: {} },
    hasDateZoomConfigChanged: false,
    requiredFiltersNote: undefined,
    controlSections: [],
    haveControlSectionsChanged: false,
    parameterControlsToSave: null,
};

describe('buildDashboardConfig', () => {
    it('preserves legacy pinned parameters through an unrelated save', () => {
        const pinnedParameters = ['currency'];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                pinnedParameters,
            },
            pinnedParameters,
            isDateZoomDisabled: true,
        });

        expect(result.pinnedParameters).toEqual(pinnedParameters);
        expect(result.isDateZoomDisabled).toBe(true);
    });

    it('carries the persisted customMetrics registry through an unrelated save', () => {
        const registry = [customMetric('total_revenue')];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                customMetrics: registry,
            },
            // Unrelated change being saved
            isDateZoomDisabled: true,
        });

        expect(result.customMetrics).toEqual(registry);
        expect(result.isDateZoomDisabled).toBe(true);
    });

    it('staged customMetrics overwrite the persisted registry', () => {
        const staged = [customMetric('avg_basket')];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                customMetrics: [customMetric('total_revenue')],
            },
            stagedCustomMetrics: staged,
        });

        expect(result.customMetrics).toEqual(staged);
    });

    it('staged empty array clears the registry (deleting the last metric)', () => {
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                customMetrics: [customMetric('total_revenue')],
            },
            stagedCustomMetrics: [],
        });

        expect(result.customMetrics).toEqual([]);
    });

    it('carries unchanged parameterOrder and date zoom settings forward', () => {
        const existingConfig: DashboardConfig = {
            isDateZoomDisabled: false,
            parameterOrder: ['p1', 'p2'],
            dateZoomGranularities: ['month'],
            defaultDateZoomGranularity: 'month',
            dateZoomConfig: {
                controls: [{ uuid: 'c1', name: 'Grain', granularity: 'month' }],
                tileTargets: {},
            },
        };
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig,
        });

        expect(result.parameterOrder).toEqual(['p1', 'p2']);
        expect(result.dateZoomGranularities).toEqual(['month']);
        expect(result.defaultDateZoomGranularity).toEqual('month');
        expect(result.dateZoomConfig).toEqual(existingConfig.dateZoomConfig);
    });

    it('carries control sections and parameter sections through a save', () => {
        const existingConfig: DashboardConfig = {
            isDateZoomDisabled: false,
            controlSections: [{ id: 's1', name: 'Dates', collapsed: true }],
            parameterSections: { region: 's1' },
        };
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig,
            isDateZoomDisabled: true,
        });

        expect(result.controlSections).toEqual(existingConfig.controlSections);
        expect(result.parameterSections).toEqual(
            existingConfig.parameterSections,
        );
        expect(result.isDateZoomDisabled).toBe(true);
    });

    it('replaces changed values instead of carrying the old ones', () => {
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                parameterOrder: ['old'],
            },
            parameterOrder: ['new'],
            hasParameterOrderChanged: true,
        });

        expect(result.parameterOrder).toEqual(['new']);
    });

    it('produces a value for every DashboardConfig key', () => {
        // A key missing from the built object is deleted on save — this
        // pins the landmine the extraction exists to defuse.
        const result = buildDashboardConfig(baseArgs);
        const expectedKeys: Record<keyof DashboardConfig, true> = {
            isDateZoomDisabled: true,
            isAddFilterDisabled: true,
            pinnedParameters: true,
            parameterOrder: true,
            dateZoomGranularities: true,
            defaultDateZoomGranularity: true,
            dateZoomConfig: true,
            requiredFiltersNote: true,
            customMetrics: true,
            controlSections: true,
            parameterSections: true,
            parameterControls: true,
            controlOrder: true,
        };
        expect(Object.keys(result).sort()).toEqual(
            Object.keys(expectedKeys).sort(),
        );
    });

    it('carries saved parameter controls forward and keeps an absent list absent', () => {
        const parameterControls: DashboardParameterControl[] = [];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                parameterControls,
            },
        });
        expect(result.parameterControls).toBe(parameterControls);
        expect(
            JSON.parse(
                JSON.stringify(
                    buildDashboardConfig({
                        ...baseArgs,
                        existingConfig: { isDateZoomDisabled: false },
                    }),
                ),
            ),
        ).not.toHaveProperty('parameterControls');
    });

    it('carries the saved control order forward and keeps an absent one absent', () => {
        const controlOrder = [
            { kind: DashboardControlRefKind.SECTION, id: 'section-1' },
        ];
        expect(
            buildDashboardConfig({
                ...baseArgs,
                existingConfig: { isDateZoomDisabled: false, controlOrder },
            }).controlOrder,
        ).toBe(controlOrder);
        expect(
            JSON.parse(
                JSON.stringify(
                    buildDashboardConfig({
                        ...baseArgs,
                        existingConfig: { isDateZoomDisabled: false },
                    }),
                ),
            ),
        ).not.toHaveProperty('controlOrder');
    });

    it('does not send a malformed stored control order', () => {
        const controlOrder = [{ kind: 'filter', slug: 'x' }];
        expect(
            buildDashboardConfig({
                ...baseArgs,
                existingConfig: {
                    isDateZoomDisabled: false,
                    controlOrder: controlOrder as unknown as NonNullable<
                        DashboardConfig['controlOrder']
                    >,
                },
            }).controlOrder,
        ).toBeUndefined();
    });

    it('writes the parameter controls to save', () => {
        const parameterControlsToSave: DashboardParameterControl[] = [];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                parameterControls: [region('EU')],
            },
            parameterControlsToSave,
        });
        expect(result.parameterControls).toBe(parameterControlsToSave);
    });

    it('saves the edited control sections once they have changed', () => {
        const controlSections = [{ id: 'section-2', name: 'Regions' }];
        const result = buildDashboardConfig({
            ...baseArgs,
            existingConfig: {
                isDateZoomDisabled: false,
                controlSections: [{ id: 'section-1', name: 'Dates' }],
            },
            controlSections,
            haveControlSectionsChanged: true,
        });

        expect(result.controlSections).toBe(controlSections);
    });
});

describe('getParametersToSave', () => {
    const appliedParameters = {
        region: { parameterName: 'region', value: 'US' },
    };
    const args = {
        parameterControls: regionList('EU'),
        areParameterControlsSaved: true,
        haveParameterControlsChanged: false,
        existingParameterControls: null,
        parameterPicks: {},
        appliedParameters,
        savedParameters: {
            region: { parameterName: 'region', value: 'EU' },
        },
    };

    it('saves the applied parameters as before without controls', () => {
        expect(
            getParametersToSave({ ...args, parameterControls: null }),
        ).toEqual({
            parameterControlsToSave: null,
            parameters: appliedParameters,
        });
    });

    it('keeps a filled list unsaved until it changes', () => {
        expect(
            getParametersToSave({ ...args, areParameterControlsSaved: false }),
        ).toEqual({
            parameterControlsToSave: null,
            parameters: appliedParameters,
        });
    });

    it('writes changed controls with picks applied, and their mirror as parameters', () => {
        expect(
            getParametersToSave({
                ...args,
                areParameterControlsSaved: false,
                haveParameterControlsChanged: true,
                parameterPicks: { region: 'US' },
            }),
        ).toEqual({
            parameterControlsToSave: regionList('US'),
            parameters: appliedParameters,
        });
    });

    it('writes a saved list when a pick changed a value, and clears a cleared key', () => {
        expect(
            getParametersToSave({
                ...args,
                parameterControls: twoKeyList('EU', 'APAC'),
                parameterPicks: { region: 'US', week_start: null },
            }),
        ).toEqual({
            parameterControlsToSave: twoKeyList('US', null),
            parameters: appliedParameters,
        });
    });

    it('keeps two controls sharing a key when nothing was picked', () => {
        const saved = [
            region('EU'),
            {
                ...control('second', 'US', ['region']),
                parameters: { region: { only: ['b'] } },
            },
        ];
        expect(
            getParametersToSave({ ...args, parameterControls: saved }),
        ).toEqual({
            parameterControlsToSave: null,
            parameters: { region: { parameterName: 'region', value: 'EU' } },
        });
    });

    describe('with the flag off over saved controls', () => {
        const off = {
            ...args,
            parameterControls: null,
            existingParameterControls: twoKeyList('EU', 'APAC'),
            savedParameters: {
                region: { parameterName: 'region', value: 'EU' },
                week_start: { parameterName: 'week_start', value: 'APAC' },
            },
        };

        it('carries the saved controls when no value changed', () => {
            expect(
                getParametersToSave({
                    ...off,
                    appliedParameters: off.savedParameters,
                }),
            ).toEqual({
                parameterControlsToSave: null,
                parameters: off.savedParameters,
            });
        });

        it('preserves saved controls when a legacy value is edited', () => {
            const applied = {
                ...off.savedParameters,
                region: { parameterName: 'region', value: 'US' },
            };
            expect(
                getParametersToSave({ ...off, appliedParameters: applied }),
            ).toEqual({
                parameterControlsToSave: null,
                parameters: applied,
            });
        });

        it('preserves saved controls when legacy values are cleared', () => {
            expect(
                getParametersToSave({ ...off, appliedParameters: {} }),
            ).toEqual({
                parameterControlsToSave: null,
                parameters: {},
            });
        });
    });

    describe('picks on keys no control sets', () => {
        const currency = (value: string) => ({
            parameterName: 'currency',
            value,
        });
        const saved = {
            ...args.savedParameters,
            currency: currency('EUR'),
        };

        it('omits a changed value from the control mirror', () => {
            expect(
                getParametersToSave({
                    ...args,
                    savedParameters: saved,
                    parameterPicks: { currency: 'USD' },
                }).parameters,
            ).toEqual({
                region: { parameterName: 'region', value: 'EU' },
            });
        });

        it('omits an added value from the control mirror', () => {
            expect(
                getParametersToSave({
                    ...args,
                    parameterPicks: { currency: 'USD' },
                }).parameters,
            ).toEqual({
                region: { parameterName: 'region', value: 'EU' },
            });
        });

        it('drops a cleared value', () => {
            expect(
                getParametersToSave({
                    ...args,
                    savedParameters: saved,
                    parameterPicks: { currency: null },
                }).parameters,
            ).toEqual({
                region: { parameterName: 'region', value: 'EU' },
            });
        });
    });

    it('omits saved values of keys no control sets', () => {
        const currency = { parameterName: 'currency', value: 'EUR' };
        expect(
            getParametersToSave({
                ...args,
                savedParameters: { ...args.savedParameters, currency },
            }).parameters,
        ).toEqual({
            region: { parameterName: 'region', value: 'EU' },
        });
    });
});
