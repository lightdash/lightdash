import {
    DEFAULT_UI_STRINGS,
    resolveUiString,
    type SdkUiOverrides,
    type UiStringKey,
} from './uiStrings';

describe('control string compatibility', () => {
    it('uses English when no override resolver was provided', () => {
        expect(resolveUiString('controls.add')).toBe('Add');
        expect(resolveUiString('explorer.back')).toBe('Back');
    });

    it('keeps every shipped rail key and its English default', () => {
        const legacyKeys = Object.keys(DEFAULT_UI_STRINGS).filter((key) =>
            key.startsWith('filters.rail.'),
        ) as UiStringKey[];
        expect(legacyKeys).toHaveLength(29);
        legacyKeys.forEach((key) => {
            const currentKey = key.replace(
                'filters.rail.',
                'controls.',
            ) as UiStringKey;
            expect(DEFAULT_UI_STRINGS[key]).toBe(
                DEFAULT_UI_STRINGS[currentKey],
            );
            expect(
                resolveUiString(currentKey, (input) =>
                    input === key ? 'old' : undefined,
                ),
            ).toBe('old');
        });
    });

    it('prefers the current override, including an empty string, then falls back to English', () => {
        const overrides: SdkUiOverrides = {
            'filters.rail.chooseTiles': 'Old choice',
            'controls.chooseTiles': '',
        };
        expect(
            resolveUiString('controls.chooseTiles', (key) => overrides[key]),
        ).toBe('');
        expect(resolveUiString('controls.add', () => undefined)).toBe('Add');
        expect(
            resolveUiString(
                'filters.rail.chooseTiles',
                (key) => overrides[key],
            ),
        ).toBe('Old choice');
    });
});
