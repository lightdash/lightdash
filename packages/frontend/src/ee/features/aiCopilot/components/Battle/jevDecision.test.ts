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
    it('badges what JEV did on a turn', () => {
        expect(
            [
                decision({ applied: true, editKind: 'filter_values' }),
                decision({ outcome: 'routed' }),
                decision({ outcome: 'unresolved', reason: 'filter-field' }),
                decision({ editKind: 'add_field', fallbackReason: 'no-chart' }),
            ].map((d) => describeJevDecision(d).badge),
        ).toEqual([
            'JEV · filter',
            'Agent · new question',
            'Agent · JEV unsure',
            'Agent · breakdown',
        ]);
    });

    it('credits JEV for its own clarifying question', () => {
        expect(
            describeJevDecision(decision({ outcome: 'clarify' })),
        ).toMatchObject({ applied: true, badge: 'JEV · clarifying question' });
    });

    it('credits JEV for an instant reply', () => {
        expect(
            describeJevDecision(
                decision({
                    outcome: 'instant_reply',
                    applied: true,
                    editKind: 'show_query',
                }),
            ),
        ).toMatchObject({ applied: true, badge: 'JEV · query summary' });
    });

    it('keeps the reason code for handoffs', () => {
        expect(
            describeJevDecision(
                decision({ outcome: 'unresolved', reason: 'filter-field' }),
            ),
        ).toMatchObject({
            title: 'JEV was not confident',
            reasonCode: 'filter-field',
        });
    });
});
