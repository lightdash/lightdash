import { type AiAgentJevDecision } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { describeJevDecision } from './jevDecision';

const decision = (
    overrides: Partial<AiAgentJevDecision>,
): AiAgentJevDecision => ({
    outcome: 'intent',
    applied: false,
    reason: null,
    fallbackReason: null,
    editKind: null,
    latencyMs: 300,
    ...overrides,
});

describe('describeJevDecision', () => {
    it('labels what JEV did on a turn', () => {
        expect(
            [
                decision({ applied: true, editKind: 'filter_values' }),
                decision({ outcome: 'routed' }),
                decision({ outcome: 'unresolved', reason: 'filter-field' }),
                decision({ editKind: 'add_field', fallbackReason: 'no-chart' }),
            ].map((d) => describeJevDecision(d).label),
        ).toEqual([
            'Instant filter',
            'Agent · new question',
            'Agent · JEV unsure',
            'Agent · breakdown fallback',
        ]);
    });

    it('explains why the agent took the turn', () => {
        expect(
            describeJevDecision(
                decision({ outcome: 'unresolved', reason: 'filter-field' }),
            ).detail,
        ).toBe(
            'JEV decided in 300ms. It could not resolve the edit (filter-field), so the agent took the turn.',
        );
    });
});
