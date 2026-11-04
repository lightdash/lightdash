import { type DashboardParameterControl } from '../types/dashboard';
import {
    fillParameterControls,
    getControlTileUuids,
    getMalformedParameterControlMessages,
    getParameterControlSetter,
    getParameterMirror,
    getTileParameterInputs,
    pruneParameterControls,
    validateParameterControls,
} from './dashboardParameterControls';

const control = (
    id: string,
    parameters: DashboardParameterControl['parameters'],
    value: DashboardParameterControl['value'] = null,
): DashboardParameterControl => ({
    id,
    label: id,
    value,
    valueType: { type: 'string', multiple: false },
    parameters,
});

describe('parameter control targeting', () => {
    const controls = [
        control(
            'default',
            { region: { except: ['b', 'c'] }, currency: 'all' },
            'EMEA',
        ),
        control('comparison', { region: { only: ['b'] } }, 'US'),
    ];
    it('resolves each key independently and excludes controlled keys even without discovery', () => {
        expect(getParameterControlSetter(controls, 'region', 'a')?.id).toBe(
            'default',
        );
        expect(getParameterControlSetter(controls, 'region', 'b')?.id).toBe(
            'comparison',
        );
        expect(
            getTileParameterInputs({
                controls,
                tileUuid: 'c',
                tileParameterReferences: {},
                overrides: { region: 'override', other: 'outside' },
            }),
        ).toEqual({
            dashboardValues: { currency: 'EMEA', other: 'outside' },
            excludedKeys: ['region'],
        });
        expect(
            getTileParameterInputs({
                controls,
                tileUuid: 'b',
                tileParameterReferences: {},
                overrides: { region: 'override' },
            }).dashboardValues.region,
        ).toBe('override');
        expect(
            getControlTileUuids({
                control: controls[1],
                controls,
                tileParameterReferences: {},
            }),
        ).toEqual(['b']);
    });
    it('validates default and explicit assignments independent of control order', () => {
        expect(validateParameterControls(controls)).toEqual([]);
        expect(
            validateParameterControls(
                [control('chosen', { region: { only: ['a'] } }), controls[0]],
                {},
                () => 'Orders',
            ),
        ).toEqual([
            'Parameter region on tile Orders is set by both default and chosen',
        ]);
        expect(
            validateParameterControls([
                control('a', { region: 'all' }),
                control('b', { region: { except: [] } }),
            ]),
        ).toHaveLength(1);
        expect(
            validateParameterControls([
                control('a', { region: { only: ['x', 'x'] } }),
                control('b', { region: { only: ['x'] } }),
            ]),
        ).toHaveLength(1);
    });
    it('rejects malformed data and duplicate ids without throwing', () => {
        expect(getMalformedParameterControlMessages(null)).toHaveLength(1);
        expect(
            validateParameterControls([
                control('a', { region: { only: ['x'], except: [] } } as never),
            ]),
        ).toHaveLength(1);
        expect(
            validateParameterControls([control('a', {}), control('a', {})]),
        ).toHaveLength(1);
    });
    it('prunes stale tiles, deduplicates lists and canonicalizes empty exceptions', () => {
        expect(
            pruneParameterControls(
                [
                    control('a', {
                        region: { except: ['gone'] },
                        currency: { only: ['a', 'a', 'gone'] },
                    }),
                ],
                { isTile: (id) => id === 'a' },
            )[0].parameters,
        ).toEqual({ region: 'all', currency: { only: ['a'] } });
    });
    it('mirrors the default value first and preserves a null chosen value', () => {
        expect(
            getParameterMirror([
                control(
                    'first',
                    { region: { only: ['a'] }, week: { only: [] } },
                    'US',
                ),
                control('default', { region: 'all' }),
                control('last', { week: { only: ['b'] } }, 'later'),
            ]),
        ).toEqual({ week: { parameterName: 'week', value: 'US' } });
    });
    it('respects shadowed reserved names in fill and resolution', () => {
        const args = {
            dashboardParameters: {},
            definitions: {},
            tileParameterReferences: { a: ['date_zoom', 'region'] },
            parameterOrder: [],
            parameterSections: {},
        };
        expect(
            fillParameterControls(args).map((c) => Object.keys(c.parameters)),
        ).toEqual([['region']]);
        expect(
            fillParameterControls({
                ...args,
                userParameterNames: ['date_zoom'],
            }),
        ).toHaveLength(2);
        const reserved = [control('zoom', { date_zoom: 'all' }, 'week')];
        expect(
            getTileParameterInputs({
                controls: reserved,
                tileUuid: 'a',
                tileParameterReferences: {},
                overrides: {},
            }).dashboardValues,
        ).toEqual({});
        expect(
            getTileParameterInputs({
                controls: reserved,
                tileUuid: 'a',
                tileParameterReferences: {},
                overrides: {},
                userParameterNames: ['date_zoom'],
            }).dashboardValues,
        ).toEqual({ date_zoom: 'week' });
    });
});
