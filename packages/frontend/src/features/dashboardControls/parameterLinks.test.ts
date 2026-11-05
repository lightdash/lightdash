import { type DashboardParameterControl } from '@lightdash/common';
import { vi } from 'vitest';
vi.mock('./peers', () => ({}));
vi.mock('./fieldCandidates', () => ({}));
import { getParameterLinkPrompts } from './linkCandidates';
import { setParameterKeyTiles } from './parameterPeers';

const control = (
    id: string,
    target: DashboardParameterControl['parameters'][string],
): DashboardParameterControl => ({
    id,
    label: id,
    value: null,
    valueType: { type: 'string', multiple: false },
    parameters: { region: target, currency: 'all' },
});
const references = { new: ['region', 'currency', 'unknown', 'date_zoom'] };
const definitions = {
    region: { label: 'Region' },
    currency: { label: 'Currency' },
};
const prompts = (controls: DashboardParameterControl[]) =>
    getParameterLinkPrompts({
        tileUuid: 'new',
        controls,
        tileParameterReferences: references,
        definitions,
    });

describe('parameter links on new tiles', () => {
    it('prompts to add an unheld key, but ignores unknown and system keys', () => {
        expect(prompts([])).toEqual([
            { key: 'region', label: 'Region', controlIds: [] },
            { key: 'currency', label: 'Currency', controlIds: [] },
        ]);
    });
    it('suppresses assigned defaults and deliberate default exclusions', () => {
        expect(prompts([control('a', 'all')])).toEqual([]);
        expect(prompts([control('a', { except: ['new'] })])).toEqual([]);
    });
    it('offers explicit holders only while the tile has no setter', () => {
        expect(
            prompts([
                control('a', { only: ['old'] }),
                control('b', { only: [] }),
            ]),
        ).toEqual([{ key: 'region', label: 'Region', controlIds: ['a', 'b'] }]);
        expect(prompts([control('a', { only: ['new'] })])).toEqual([]);
    });
    it('links just the chosen key without stealing another setter', () => {
        const controls = [
            control('a', { only: ['old'] }),
            control('b', { only: [] }),
        ];
        const args = {
            controlId: 'a',
            key: 'region',
            tileUuids: ['new'],
            tileParameterReferences: references,
            included: true,
            userParameterNames: Object.keys(definitions),
        };
        const linked = setParameterKeyTiles({ controls, ...args });
        expect(linked[0].parameters).toEqual({
            region: { only: ['old', 'new'] },
            currency: 'all',
        });
        expect(
            setParameterKeyTiles({ controls: linked, ...args, controlId: 'b' }),
        ).toBe(linked);
    });
});
