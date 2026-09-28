import { type AiAgentJevDecision } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getJevChoices } from './jevDecision';

describe('getJevChoices', () => {
    it('reads no choices from an API response that predates them', () => {
        const fromOlderApi: AiAgentJevDecision = JSON.parse(
            '{"outcome":"intent","applied":true,"reason":null,"fallbackReason":null,"editKind":"sort","latencyMs":300}',
        );
        expect(getJevChoices(fromOlderApi)).toEqual([]);
        expect(getJevChoices(null)).toEqual([]);
    });

    it('returns the offered choices', () => {
        const choices = [{ label: 'Add Revenue', prompt: 'Add Revenue' }];
        expect(
            getJevChoices({
                outcome: 'clarify',
                applied: false,
                reason: null,
                fallbackReason: null,
                editKind: null,
                latencyMs: 300,
                choices,
            }),
        ).toEqual(choices);
    });
});
