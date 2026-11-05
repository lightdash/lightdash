import {
    DEFAULT_UI_STRINGS,
    type AiAgentJevDecision,
    type UiStringKey,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getArtifactCardMeta, isArtifactRevision } from './artifactCardMeta';

const english = (key: UiStringKey) => DEFAULT_UI_STRINGS[key];

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

describe('getArtifactCardMeta', () => {
    it('omits the marker for an unrevised result', () => {
        expect(
            getArtifactCardMeta(
                {
                    artifactType: 'chart',
                    isRevision: false,
                    isArtifactOpen: true,
                    isTurnFinishing: false,
                },
                english,
            ),
        ).toBe('Chart · Shown in panel');
    });

    it('marks revised results', () => {
        expect(
            getArtifactCardMeta(
                {
                    artifactType: 'chart',
                    isRevision: true,
                    isArtifactOpen: false,
                    isTurnFinishing: false,
                },
                english,
            ),
        ).toBe('Chart · Edited · Ready to view');
    });

    it('leaves the status to the turn while the agent is still replying', () => {
        expect(
            getArtifactCardMeta(
                {
                    artifactType: 'dashboard',
                    isRevision: false,
                    isArtifactOpen: true,
                    isTurnFinishing: true,
                },
                english,
            ),
        ).toBe('Dashboard');
    });
});
