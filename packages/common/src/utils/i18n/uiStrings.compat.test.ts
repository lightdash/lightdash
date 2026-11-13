import { resolveUiString, type SdkUiOverrides } from './uiStrings';

describe('control string overrides', () => {
    it('uses English when no override resolver was provided', () => {
        expect(resolveUiString('controls.add')).toBe('Add');
        expect(resolveUiString('explorer.back')).toBe('Back');
    });

    it('prefers the override, including an empty string, then falls back to English', () => {
        const overrides: SdkUiOverrides = { 'controls.chooseTiles': '' };
        expect(
            resolveUiString('controls.chooseTiles', (key) => overrides[key]),
        ).toBe('');
        expect(resolveUiString('controls.add', () => undefined)).toBe('Add');
    });
});
