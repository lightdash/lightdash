import { type DashboardParameterControl } from '../types/parameters';
import {
    getDashboardValuesForTile,
    isDashboardParameterSetOnTile,
} from './dashboardParameterControls';

const control = (
    tileTargets: DashboardParameterControl['tileTargets'] = {},
    parameterKeys = ['order_date', 'ship_date'],
): DashboardParameterControl => ({
    id: 'c1',
    label: 'Reporting date',
    parameterKeys,
    tileTargets,
});

const dashboardValues = {
    order_date: '2026-01-01',
    ship_date: '2026-01-01',
    region: 'EMEA',
};

describe('getDashboardValuesForTile', () => {
    test('returns every value when the dashboard has no controls', () => {
        expect(
            getDashboardValuesForTile({
                dashboardValues,
                parameterControls: [],
                tileUuid: 'a',
            }),
        ).toBe(dashboardValues);
    });

    test('a tile with no entry gets every parameter of the control', () => {
        expect(
            getDashboardValuesForTile({
                dashboardValues,
                parameterControls: [control()],
                tileUuid: 'a',
            }),
        ).toEqual(dashboardValues);
    });

    test('a tile targeted at one parameter gets only that one from the control', () => {
        expect(
            getDashboardValuesForTile({
                dashboardValues,
                parameterControls: [control({ a: 'ship_date' })],
                tileUuid: 'a',
            }),
        ).toEqual({ ship_date: '2026-01-01', region: 'EMEA' });
    });

    test('a tile switched off gets none of the control but keeps other parameters', () => {
        expect(
            getDashboardValuesForTile({
                dashboardValues,
                parameterControls: [control({ a: false })],
                tileUuid: 'a',
            }),
        ).toEqual({ region: 'EMEA' });
    });

    test('targets are per tile', () => {
        expect(
            getDashboardValuesForTile({
                dashboardValues,
                parameterControls: [control({ a: false })],
                tileUuid: 'b',
            }),
        ).toEqual(dashboardValues);
    });

    test('a target for a parameter the control no longer holds counts as no entry', () => {
        expect(
            getDashboardValuesForTile({
                dashboardValues,
                parameterControls: [control({ a: 'removed_key' })],
                tileUuid: 'a',
            }),
        ).toEqual(dashboardValues);
    });
});

describe('isDashboardParameterSetOnTile', () => {
    test('a parameter in no control always applies', () => {
        expect(
            isDashboardParameterSetOnTile({
                key: 'region',
                parameterControls: [control({ a: false })],
                tileUuid: 'a',
            }),
        ).toBe(true);
    });

    test('the first control holding the parameter decides', () => {
        expect(
            isDashboardParameterSetOnTile({
                key: 'order_date',
                parameterControls: [
                    control({ a: false }),
                    { ...control(), id: 'c2' },
                ],
                tileUuid: 'a',
            }),
        ).toBe(false);
    });
});
