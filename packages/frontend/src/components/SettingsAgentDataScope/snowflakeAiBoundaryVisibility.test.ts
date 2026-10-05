import { describe, expect, it } from 'vitest';
import { shouldShowSnowflakeAiBoundaryGuide } from './snowflakeAiBoundaryVisibility';

describe('Snowflake AI boundary guide visibility', () => {
    it.each([
        [true, true, true, true],
        [false, true, true, false],
        [true, false, true, false],
        [true, true, false, false],
    ])(
        'guide %s, sign-in %s, update permission %s gives %s',
        (guide, signIn, permission, expected) => {
            expect(
                shouldShowSnowflakeAiBoundaryGuide(guide, signIn, permission),
            ).toBe(expected);
        },
    );
});
