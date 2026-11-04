import { type DashboardParameterControl } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyParameterPicks,
    getDashboardExportTileParameters,
    getParameterControlInputs,
    getTileDashboardParameterInputs,
} from './parameterControls';

const control = (
    id: string,
    value: string | null,
    target: DashboardParameterControl['parameters'][string] = 'all',
): DashboardParameterControl => ({
    id,
    label: id,
    value,
    valueType: { type: 'string', multiple: false },
    parameters: { week_start: target },
});

// Sales sets every tile but "other"; ops takes the ops tile
const sharedKeyControls = [
    control('sales', 'monday', { except: ['ops', 'other'] }),
    control('ops', 'sunday', { only: ['ops'] }),
];

describe('applyParameterPicks', () => {
    it('sets every control holding a picked key', () => {
        expect(
            applyParameterPicks(sharedKeyControls, { week_start: 'tuesday' }),
        ).toEqual(
            sharedKeyControls.map((item) => ({ ...item, value: 'tuesday' })),
        );
    });

    it('leaves a control with no parameters as it is', () => {
        const orphan = [{ ...control('sales', 'monday'), parameters: {} }];
        expect(applyParameterPicks(orphan, { week_start: 'tuesday' })).toEqual(
            orphan,
        );
    });
});

describe('getTileDashboardParameterInputs', () => {
    const tileParameterReferences = {
        sales: ['week_start'],
        ops: ['week_start'],
        other: ['week_start'],
    };

    it('gives every tile the dashboard values without controls', () => {
        expect(
            getTileDashboardParameterInputs({
                controlInputs: null,
                tileUuid: 'other',
                tileParameterReferences,
                dashboardValues: { week_start: 'monday' },
            }),
        ).toEqual({
            dashboardValues: { week_start: 'monday' },
            excludedKeys: [],
        });
    });

    const inputsFor = (picks: Record<string, string | null>) =>
        ['sales', 'ops', 'other'].map(
            (tileUuid) =>
                getTileDashboardParameterInputs({
                    controlInputs: getParameterControlInputs(
                        sharedKeyControls,
                        picks,
                        [],
                    ),
                    tileUuid,
                    tileParameterReferences,
                    dashboardValues: {},
                }).dashboardValues,
        );

    it('a pick equal to the first control value still reaches the second control', () => {
        expect(inputsFor({ week_start: 'monday' })).toEqual([
            { week_start: 'monday' },
            { week_start: 'monday' },
            {},
        ]);
    });

    it('a cleared pick leaves each control its own value', () => {
        expect(inputsFor({ week_start: null })).toEqual([
            { week_start: 'monday' },
            { week_start: 'sunday' },
            {},
        ]);
    });

    it('keeps control picks independent while outside key values reach both setters', () => {
        const resolve = (tileUuid: string, picks = {}) =>
            getTileDashboardParameterInputs({
                controlInputs: getParameterControlInputs(
                    sharedKeyControls,
                    picks,
                    [],
                    { ops: 'friday' },
                ),
                tileUuid,
                tileParameterReferences,
                dashboardValues: {},
            }).dashboardValues;
        expect(resolve('sales')).toEqual({ week_start: 'monday' });
        expect(resolve('ops')).toEqual({ week_start: 'friday' });
        expect(resolve('sales', { week_start: 'tuesday' })).toEqual({
            week_start: 'tuesday',
        });
        expect(resolve('ops', { week_start: 'tuesday' })).toEqual({
            week_start: 'tuesday',
        });
    });

    it('uses a safety-net value only on unassigned tiles', () => {
        const inputs = getParameterControlInputs(
            sharedKeyControls,
            {},
            [],
            {},
            { sales: { week_start: 'wrong' }, other: { week_start: 'local' } },
        );
        expect(
            getTileDashboardParameterInputs({
                controlInputs: inputs,
                tileUuid: 'sales',
                tileParameterReferences,
                dashboardValues: {},
            }).dashboardValues,
        ).toEqual({ week_start: 'monday' });
        expect(
            getTileDashboardParameterInputs({
                controlInputs: inputs,
                tileUuid: 'other',
                tileParameterReferences,
                dashboardValues: {},
            }),
        ).toEqual({
            dashboardValues: { week_start: 'local' },
            excludedKeys: [],
        });
    });

    it('gives each tile the value of the control that sets it', () => {
        const controlInputs = getParameterControlInputs(
            sharedKeyControls,
            {},
            [],
        );
        expect(
            ['sales', 'ops', 'other'].map((tileUuid) =>
                getTileDashboardParameterInputs({
                    controlInputs,
                    tileUuid,
                    tileParameterReferences,
                    dashboardValues: { week_start: 'monday' },
                }),
            ),
        ).toEqual([
            { dashboardValues: { week_start: 'monday' }, excludedKeys: [] },
            { dashboardValues: { week_start: 'sunday' }, excludedKeys: [] },
            { dashboardValues: {}, excludedKeys: ['week_start'] },
        ]);
    });
});

describe('dashboard data export parameters', () => {
    it('omits the tile map without controls and resolves each tile when enabled', () => {
        const args = {
            tileUuids: ['sales', 'ops', 'other'],
            tileParameterReferences: {},
        };
        expect(
            getDashboardExportTileParameters({ ...args, controlInputs: null }),
        ).toBeUndefined();
        expect(
            getDashboardExportTileParameters({
                ...args,
                controlInputs: getParameterControlInputs(
                    sharedKeyControls,
                    {},
                    [],
                ),
            }),
        ).toEqual({
            sales: {
                parameters: { week_start: 'monday' },
                excludedParameterKeys: [],
            },
            ops: {
                parameters: { week_start: 'sunday' },
                excludedParameterKeys: [],
            },
            other: { parameters: {}, excludedParameterKeys: ['week_start'] },
        });
    });
});
