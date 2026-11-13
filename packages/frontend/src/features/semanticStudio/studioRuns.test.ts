import {
    CiCheckState,
    CiMergeState,
    CiProviderType,
    type CiChecks,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isInFlight, toStudioRun } from './studioRuns';

const workspace = (
    overrides: Partial<SemanticStudioWorkspace> = {},
): SemanticStudioWorkspace => ({
    workspaceUuid: 'w1',
    projectUuid: 'p1',
    name: 'Revenue by region',
    threadUuid: 't1',
    agentUuid: 'a1',
    owner: { userUuid: 'u1', name: 'Ana' },
    isMine: true,
    isActive: false,
    pullRequest: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    finishedAt: null,
    ...overrides,
});

const inReview = workspace({
    pullRequest: { url: 'https://github.com/o/r/pull/12', state: 'open' },
});

const checks = (overrides: Partial<CiChecks>): CiChecks => ({
    provider: CiProviderType.GITHUB,
    overall: CiCheckState.SUCCESS,
    mergeState: CiMergeState.BLOCKED,
    merged: false,
    state: 'open',
    checks: [],
    ...overrides,
});

describe('toStudioRun', () => {
    it('reads a running save before anything else', () => {
        expect(
            toStudioRun(inReview, { savingStep: 1, ciChecks: null }),
        ).toEqual({ kind: 'saving', step: 1 });
    });

    it('waits on you when the pull request can merge or is broken', () => {
        expect(
            toStudioRun(inReview, {
                savingStep: null,
                ciChecks: checks({ mergeState: CiMergeState.READY }),
            }).kind,
        ).toBe('ready');
        expect(
            toStudioRun(inReview, {
                savingStep: null,
                ciChecks: checks({ overall: CiCheckState.FAILURE }),
            }),
        ).toEqual({
            kind: 'failing',
            pullRequestNumber: '12',
            reason: 'Checks failed',
        });
    });

    it('stays in review while blocked on a reviewer or still checking', () => {
        expect(
            toStudioRun(inReview, {
                savingStep: null,
                ciChecks: checks({ overall: CiCheckState.PENDING }),
            }),
        ).toEqual({
            kind: 'in_review',
            pullRequestNumber: '12',
            checks: 'running',
        });
    });

    it('is a draft with no pull request', () => {
        expect(
            toStudioRun(workspace(), { savingStep: null, ciChecks: null }),
        ).toEqual({ kind: 'draft' });
    });
});

describe('isInFlight', () => {
    it('drops finished, merged and closed work', () => {
        expect(isInFlight(inReview)).toBe(true);
        expect(isInFlight(workspace({ finishedAt: new Date() }))).toBe(false);
        expect(
            isInFlight(
                workspace({
                    pullRequest: { url: 'x/pull/1', state: 'merged' },
                }),
            ),
        ).toBe(false);
    });
});
