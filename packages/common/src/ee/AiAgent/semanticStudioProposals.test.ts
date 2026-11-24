import { describe, expect, it } from 'vitest';
import { type SemanticLayerDraft } from '../../types/semanticStudio';
import { type SemanticLayerProposal } from './schemas/tools/toolSemanticStudioArgs';
import {
    endsTurnOnCard,
    getProposalPhase,
    getRunProposals,
    getSavedProposals,
    getStudioCardReply,
    showsProposalSummary,
} from './semanticStudioProposals';

const proposal = (
    draftChangeUuid: string | null,
    overrides: Partial<SemanticLayerProposal> = {},
): SemanticLayerProposal => ({
    status: 'success',
    models: [
        {
            model: 'orders',
            status: draftChangeUuid ? 'ready' : 'failed',
            changes: [],
            refusals: [],
            error: null,
        },
    ],
    diffs: [],
    draftChangeUuid,
    startedChange: null,
    note: null,
    options: [],
    needsFollowUp: false,
    ...overrides,
});

describe('reading proposals', () => {
    it('reads saved tool results of the propose tool only', () => {
        const metadata = proposal('d1');
        expect(
            getSavedProposals([
                {
                    toolType: 'built-in',
                    toolName: 'proposeSemanticLayerChange',
                    metadata,
                },
                {
                    toolType: 'built-in',
                    toolName: 'readSemanticModel',
                    metadata,
                },
                {
                    toolType: 'built-in',
                    toolName: 'proposeSemanticLayerChange',
                    metadata: { status: 'error' },
                },
            ]),
        ).toEqual([metadata]);
    });

    it("reads a rejection's kind, and a result saved before rejections had one", () => {
        const failed = (rejection: unknown) => ({
            toolType: 'built-in',
            toolName: 'proposeSemanticLayerChange',
            metadata: {
                ...proposal(null),
                models: [
                    {
                        model: 'orders',
                        status: 'failed',
                        changes: [],
                        refusals: [],
                        error: 'The warehouse rejected this model: no access',
                        ...(rejection === undefined ? {} : { rejection }),
                    },
                ],
            },
        });
        const read = getSavedProposals([
            failed(undefined),
            failed({ kind: 'already_failing', detail: 'no access' }),
            failed({ kind: 'not_a_kind', detail: 'no access' }),
        ]);
        expect(read.map(({ models }) => models[0].rejection ?? null)).toEqual([
            null,
            { kind: 'already_failing', detail: 'no access' },
        ]);
    });

    it('reads run outputs, skipping errors and anything without metadata', () => {
        const metadata = proposal('d1');
        expect(
            getRunProposals([
                {
                    toolName: 'proposeSemanticLayerChange',
                    output: { result: 'ok', metadata },
                },
                {
                    toolName: 'proposeSemanticLayerChange',
                    output: { result: 'no', metadata: { status: 'error' } },
                },
                { toolName: 'proposeSemanticLayerChange', output: null },
                { toolName: 'runQuery', output: { metadata } },
            ]),
        ).toEqual([metadata]);
    });
});

describe('ending a turn on its card', () => {
    it('replies with what joined the draft, or nothing when nothing did', () => {
        expect(getStudioCardReply([proposal('d1'), proposal(null)])).toBe(
            'Changed orders in the draft.',
        );
        expect(getStudioCardReply([proposal(null)])).toBeNull();
    });

    it('ends the turn only when every proposal joined cleanly', () => {
        expect(endsTurnOnCard([proposal('d1')])).toBe(true);
        expect(endsTurnOnCard([])).toBe(false);
        expect(endsTurnOnCard([proposal('d1'), proposal(null)])).toBe(false);
        expect(endsTurnOnCard([proposal('d1', { needsFollowUp: true })])).toBe(
            false,
        );
    });

    it('holds back the summary of a failed attempt while the turn works', () => {
        expect(showsProposalSummary([proposal(null)], true)).toBe(false);
        expect(showsProposalSummary([proposal(null)], false)).toBe(true);
        expect(showsProposalSummary([proposal('d1')], true)).toBe(true);
        expect(showsProposalSummary([], false)).toBe(false);
    });
});

describe('getProposalPhase', () => {
    const draft = (
        changes: string[],
        settled: SemanticLayerDraft['settled'],
    ): SemanticLayerDraft => ({
        changes: changes.map((draftChangeUuid) => ({
            draftChangeUuid,
            question: null,
            createdAt: new Date(0),
            models: [],
            projectContextEntries: [],
        })),
        models: [],
        projectContext: null,
        errors: [],
        settled,
        inReview: [],
        othersDrafting: [],
    });
    const settled = (
        draftChangeUuid: string,
        status: 'applied' | 'undone' | 'discarded',
        pullRequestUrl: string | null = null,
    ) => ({ draftChangeUuid, status, pullRequestUrl, models: [] });
    const latest = { pullRequestFrom: 'latest_applied' } as const;
    const any = { pullRequestFrom: 'any_applied' } as const;

    it('finds the change in the draft first', () => {
        expect(getProposalPhase(draft(['d1'], []), ['d1'], latest).kind).toBe(
            'in_draft',
        );
    });

    it('tells a published change from one sent as a pull request', () => {
        const withPr = draft(
            [],
            [settled('d2', 'applied'), settled('d1', 'applied', 'pr/1')],
        );
        expect(getProposalPhase(withPr, ['d1', 'd2'], latest)).toEqual({
            kind: 'applied',
        });
        expect(getProposalPhase(withPr, ['d1', 'd2'], any)).toEqual({
            kind: 'pull_request',
            url: 'pr/1',
        });
    });

    it('reads undone only when every settled change was undone', () => {
        expect(
            getProposalPhase(draft([], [settled('d1', 'undone')]), ['d1'], any),
        ).toEqual({ kind: 'undone' });
        expect(
            getProposalPhase(
                draft(
                    [],
                    [settled('d1', 'undone'), settled('d2', 'discarded')],
                ),
                ['d1', 'd2'],
                any,
            ),
        ).toEqual({ kind: 'discarded' });
    });

    it('is unknown when the draft as read has not seen the change', () => {
        expect(getProposalPhase(draft([], []), ['d1'], any)).toEqual({
            kind: 'unknown',
        });
    });
});
