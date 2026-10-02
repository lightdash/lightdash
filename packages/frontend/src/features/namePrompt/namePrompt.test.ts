import { describe, expect, it } from 'vitest';
import { isNameMissing } from './namePrompt';

describe('isNameMissing', () => {
    it('treats whitespace as missing', () => {
        expect(isNameMissing({ firstName: ' ', lastName: 'Lovelace' })).toBe(
            true,
        );
    });

    it('is true when one name is empty', () => {
        expect(isNameMissing({ firstName: 'Ada', lastName: '' })).toBe(true);
    });

    it('is false when both names are present', () => {
        expect(isNameMissing({ firstName: 'Ada', lastName: 'Lovelace' })).toBe(
            false,
        );
    });
});
