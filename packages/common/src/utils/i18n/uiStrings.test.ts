import { DEFAULT_UI_STRINGS, interpolateUiString } from './uiStrings';

describe('interpolateUiString', () => {
    it('replaces named tokens', () => {
        expect(interpolateUiString('Applies to {n} charts', { n: 3 })).toEqual(
            'Applies to 3 charts',
        );
    });

    it('leaves unknown tokens untouched', () => {
        expect(interpolateUiString('Hi {name}', {})).toEqual('Hi {name}');
    });

    it('replaces multiple tokens', () => {
        expect(interpolateUiString('{a} and {b}', { a: 'x', b: 'y' })).toEqual(
            'x and y',
        );
    });
});

describe('DEFAULT_UI_STRINGS', () => {
    it('has no empty values', () => {
        const emptyKeys = Object.entries(DEFAULT_UI_STRINGS)
            .filter(([, value]) => value.length === 0)
            .map(([key]) => key);
        expect(emptyKeys).toEqual([]);
    });
});
