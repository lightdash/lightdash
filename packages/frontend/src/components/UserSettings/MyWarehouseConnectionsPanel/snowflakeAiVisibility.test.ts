import { describe, expect, it } from 'vitest';
import { shouldShowAgentConnection } from './snowflakeAiVisibility';

describe('shouldShowAgentConnection', () => {
    it.each([
        [false, false, false],
        [false, true, false],
        [true, false, false],
        [true, true, true],
    ])('resolves flag %s and client %s to %s', (flag, client, visible) => {
        expect(shouldShowAgentConnection(flag, client)).toBe(visible);
    });
    it.each([true, false])(
        'requires the flag for a BigQuery-only section: %s',
        (flag) => {
            expect(shouldShowAgentConnection(flag, false, true)).toBe(flag);
        },
    );
});
