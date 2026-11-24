import { describe, expect, it } from 'vitest';
import { listProposalIssues, listTurnIssues } from './proposalIssues';

const attempt = (status: 'ready' | 'failed', error: string | null) => ({
    models: [
        {
            model: 'orders',
            status,
            changes:
                status === 'ready'
                    ? [{ path: 'label', action: 'patched' as const }]
                    : [],
            refusals: [],
            error,
        },
    ],
});

describe('listProposalIssues', () => {
    it('says why a part was left out in the words the agent is told', () => {
        expect(
            listProposalIssues({
                models: [
                    {
                        model: 'orders',
                        status: 'ready',
                        changes: [],
                        refusals: [
                            { path: 'metrics.revenue', reason: 'not_found' },
                        ],
                        error: null,
                    },
                ],
            }),
        ).toEqual([
            {
                kind: 'skipped',
                model: 'orders',
                detail: 'metrics.revenue is not in the model.',
            },
        ]);
    });
});

describe('listTurnIssues', () => {
    it('drops a failure the agent fixed later in the same turn', () => {
        expect(
            listTurnIssues([
                attempt('failed', 'The warehouse rejected this model'),
                attempt('ready', null),
            ]),
        ).toEqual([]);
    });

    it('drops what was refused on a failed model once the agent fixed it', () => {
        const refused = {
            models: [
                {
                    model: 'orders',
                    status: 'failed' as const,
                    changes: [],
                    refusals: [
                        {
                            path: 'dimensions.status',
                            reason: 'name_taken' as const,
                        },
                    ],
                    error: 'None of this change to orders was added.',
                },
            ],
        };
        const fixed = {
            models: [
                {
                    ...refused.models[0],
                    status: 'ready' as const,
                    changes: [
                        { path: 'dimensions.status', action: 'added' as const },
                    ],
                    refusals: [],
                    error: null,
                },
            ],
        };
        expect(listTurnIssues([refused, fixed])).toEqual([]);
        expect(listTurnIssues([refused])).toHaveLength(2);
    });

    it('keeps a refusal a later success did not resolve', () => {
        const refused = {
            models: [
                {
                    model: 'orders',
                    status: 'failed' as const,
                    changes: [],
                    refusals: [
                        { path: 'tags', reason: 'access' as const },
                        {
                            path: 'dimensions.status',
                            reason: 'name_taken' as const,
                        },
                    ],
                    error: 'None of this change to orders was added.',
                },
            ],
        };
        const labelOnly = {
            models: [
                {
                    model: 'orders',
                    status: 'ready' as const,
                    changes: [{ path: 'label', action: 'patched' as const }],
                    refusals: [],
                    error: null,
                },
            ],
        };
        expect(listTurnIssues([refused, labelOnly])).toEqual([
            {
                kind: 'skipped',
                model: 'orders',
                detail: 'tags changes who can see it, which cannot be changed here.',
            },
            {
                kind: 'skipped',
                model: 'orders',
                detail: 'dimensions.status uses a name another field of this model already has.',
            },
        ]);
    });

    it('treats a success that changed nothing as fixing nothing', () => {
        const failed = attempt('failed', 'The warehouse rejected this model');
        expect(
            listTurnIssues([
                failed,
                {
                    models: [
                        { ...failed.models[0], status: 'ready', error: null },
                    ],
                },
            ]),
        ).toHaveLength(1);
    });

    it('keeps a failure nothing fixed, and one that came after a success', () => {
        const failed = attempt('failed', 'The warehouse rejected this model');
        const issue = {
            kind: 'failed',
            model: 'orders',
            detail: 'The warehouse rejected this model',
        };
        expect(listTurnIssues([failed])).toEqual([issue]);
        expect(listTurnIssues([attempt('ready', null), failed])).toEqual([
            issue,
        ]);
    });
});
