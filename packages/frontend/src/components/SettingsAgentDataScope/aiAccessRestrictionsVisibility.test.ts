import { describe, expect, it } from 'vitest';
import { shouldShowAiAccessRestrictions } from './aiAccessRestrictionsVisibility';

describe('shouldShowAiAccessRestrictions', () => {
    it.each([
        [false, false, false],
        [false, true, false],
        [true, false, false],
        [true, true, true],
    ])(
        'flag %s and update permission %s show switch %s',
        (flag, permission, expected) => {
            expect(shouldShowAiAccessRestrictions(flag, permission)).toBe(
                expected,
            );
        },
    );
});
