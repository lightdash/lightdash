import {
    type DashboardParameterControl,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    addNeedsValueControl,
    getControlSectionId,
    getTabTileUuids,
    isControlShownOnTab,
    moveParameterControl,
} from './parameterControlsBar';

const control = (
    id: string,
    sectionId?: string,
): DashboardParameterControl => ({
    id,
    label: id,
    value: null,
    valueType: { type: 'string', multiple: false },
    parameters: { [id]: 'all' },
    ...(sectionId !== undefined && { sectionId }),
});
const sections = [{ id: 'market', name: 'Market' }];
const ids = (controls: DashboardParameterControl[]) =>
    controls.map(
        ({ id, sectionId }) => `${id}${sectionId ? `@${sectionId}` : ''}`,
    );

describe('getControlSectionId', () => {
    it('reads a dangling section as none', () => {
        expect(getControlSectionId(control('a', 'market'), sections)).toBe(
            'market',
        );
        expect(getControlSectionId(control('a', 'gone'), sections)).toBeNull();
    });
});

describe('moveParameterControl', () => {
    const controls = [control('a'), control('b'), control('c', 'market')];

    it('takes the place and section of the control it is dropped on', () => {
        expect(
            ids(
                moveParameterControl(
                    controls,
                    'a',
                    { controlId: 'b' },
                    sections,
                ),
            ),
        ).toEqual(['b', 'a', 'c@market']);
        expect(
            ids(
                moveParameterControl(
                    controls,
                    'a',
                    { controlId: 'c' },
                    sections,
                ),
            ),
        ).toEqual(['b', 'c@market', 'a@market']);
    });

    it('goes last into a section, or out of every section', () => {
        expect(
            ids(
                moveParameterControl(
                    controls,
                    'a',
                    { sectionId: 'market' },
                    sections,
                ),
            ),
        ).toEqual(['b', 'c@market', 'a@market']);
        expect(
            ids(
                moveParameterControl(
                    controls,
                    'c',
                    { sectionId: null },
                    sections,
                ),
            ),
        ).toEqual(['a', 'b', 'c']);
    });

    it('returns the same list when nothing moves', () => {
        expect(
            moveParameterControl(controls, 'a', { controlId: 'a' }, sections),
        ).toBe(controls);
        expect(
            moveParameterControl(controls, 'a', { sectionId: null }, sections),
        ).toBe(controls);
        expect(
            moveParameterControl(controls, 'x', { sectionId: null }, sections),
        ).toBe(controls);
    });
});

describe('getTabTileUuids', () => {
    const tile = (uuid: string, tabUuid: string | undefined) =>
        ({ uuid, tabUuid }) as DashboardTile;
    const tabs = [
        { uuid: 't1', name: 'One', order: 0 },
        { uuid: 't2', name: 'Two', order: 1 },
    ];
    const tiles = [tile('a', 't1'), tile('b', 't2'), tile('c', 'gone')];

    it('keeps the tab in view, a tile on a gone tab on the first', () => {
        expect([...getTabTileUuids(tiles, tabs, 't1')]).toEqual(['a', 'c']);
        expect([...getTabTileUuids(tiles, tabs, 't2')]).toEqual(['b']);
        expect([...getTabTileUuids(tiles, [], undefined)]).toEqual([
            'a',
            'b',
            'c',
        ]);
    });
});

describe('isControlShownOnTab', () => {
    it('shows a control bound to a tile in view, or one bound to none', () => {
        expect(isControlShownOnTab(['a'], new Set(['a']))).toBe(true);
        expect(isControlShownOnTab(['b'], new Set(['a']))).toBe(false);
        expect(isControlShownOnTab([], new Set(['a']))).toBe(true);
    });
});

describe('addNeedsValueControl', () => {
    it('sets every tile using the key when no control holds it', () => {
        const region = control('region');
        const added = {
            ...control('added'),
            parameters: { currency: 'all' as const },
        };
        expect(addNeedsValueControl([region], added, ['b', 'c'])).toEqual([
            region,
            { ...added, parameters: { currency: 'all' } },
        ]);
    });

    it('sets only the tiles left out beside an all control holding the key', () => {
        const region = control('region');
        const added = {
            ...control('added'),
            parameters: { region: 'all' as const },
        };
        expect(addNeedsValueControl([region], added, ['b', 'c'])).toEqual([
            region,
            { ...added, parameters: { region: { only: ['b', 'c'] } } },
        ]);
    });

    it('sets every tile using the key when only selected controls hold it', () => {
        const chosen = {
            ...control('region'),
            parameters: { region: { only: ['a'] } },
        };
        const added = {
            ...control('added'),
            parameters: { region: 'all' as const },
        };
        expect(addNeedsValueControl([chosen], added, ['b'])).toEqual([
            chosen,
            { ...added, parameters: { region: { only: ['b'] } } },
        ]);
    });
});
