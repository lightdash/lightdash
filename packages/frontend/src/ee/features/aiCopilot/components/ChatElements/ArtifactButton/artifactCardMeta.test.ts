import { type AiAgentJevDecision } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isArtifactRevision } from './artifactCardMeta';

const decision = (
    outcome: AiAgentJevDecision['outcome'],
): AiAgentJevDecision => ({
    outcome,
    applied: outcome === 'intent',
    reason: null,
    fallbackReason: null,
    editKind: outcome === 'intent' ? 'chart_type' : null,
    latencyMs: 10,
    choices: [],
});

describe('isArtifactRevision', () => {
    it('ignores later versions the agent built from scratch', () => {
        expect(
            isArtifactRevision({
                versionNumber: 3,
                jevDecision: decision('routed'),
            }),
        ).toBe(false);
        expect(
            isArtifactRevision({ versionNumber: 2, jevDecision: null }),
        ).toBe(false);
    });

    it('marks versions from a resolved edit turn', () => {
        expect(
            isArtifactRevision({
                versionNumber: 2,
                jevDecision: decision('intent'),
            }),
        ).toBe(true);
    });

    it('never marks a first version', () => {
        expect(
            isArtifactRevision({
                versionNumber: 1,
                jevDecision: decision('intent'),
            }),
        ).toBe(false);
    });
});
