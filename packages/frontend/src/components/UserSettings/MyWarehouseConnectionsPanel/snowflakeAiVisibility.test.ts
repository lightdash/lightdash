import { describe, expect, it } from 'vitest';
import { shouldShowSnowflakeAiSignIn } from './snowflakeAiVisibility';

describe('shouldShowSnowflakeAiSignIn', () => {
    it.each([
        [false, false, false],
        [false, true, false],
        [true, false, false],
        [true, true, true],
    ])('resolves flag %s and client %s to %s', (flag, client, visible) => {
        expect(shouldShowSnowflakeAiSignIn(flag, client)).toBe(visible);
    });
});
