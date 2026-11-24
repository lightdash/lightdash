import {
    describeModelFragmentRefusal,
    summarizeSemanticStudioRejection,
    type SemanticLayerProposal,
    type SemanticStudioRejection,
} from '@lightdash/common';
import {
    IconAlertTriangle,
    IconInfoCircle,
    IconMinus,
    type Icon,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';

export const ISSUE_KINDS = {
    failed: { icon: IconAlertTriangle, color: 'red', label: 'Not added' },
    skipped: { icon: IconMinus, color: 'gray', label: 'Left out' },
    note: { icon: IconInfoCircle, color: 'orange', label: 'Confirm' },
} satisfies Record<string, { icon: Icon; color: string; label: string }>;

export type Issue = {
    kind: keyof typeof ISSUE_KINDS;
    model: string;
    detail: string;
    /** Why a check left the model out; null for anything else, and for results saved before rejections had a kind. */
    rejection: SemanticStudioRejection | null;
};

/** What in a proposal did not go as asked: models that failed, parts left out, and notes to confirm. */
export const listProposalIssues = (
    proposal: Pick<SemanticLayerProposal, 'models'>,
): Issue[] =>
    proposal.models.flatMap(
        ({ model, error, rejection, refusals, notes }): Issue[] => [
            ...(error
                ? [
                      {
                          kind: 'failed' as const,
                          model,
                          detail: rejection
                              ? summarizeSemanticStudioRejection(
                                    model,
                                    rejection,
                                )
                              : error,
                          rejection: rejection ?? null,
                      },
                  ]
                : []),
            ...refusals.map((refusal) => ({
                kind: 'skipped' as const,
                model,
                detail: describeModelFragmentRefusal(refusal),
                rejection: null,
            })),
            ...(notes ?? []).map((detail) => ({
                kind: 'note' as const,
                model,
                detail,
                rejection: null,
            })),
        ],
    );

/** A turn's issues across its proposals; a failed model's error goes once a later proposal changes it, and each refusal once a later one changes that part. */
export const listTurnIssues = (
    proposals: Pick<SemanticLayerProposal, 'models'>[],
): Issue[] =>
    proposals.flatMap((proposal, index) => {
        const changedLater = (model: string) =>
            proposals
                .slice(index + 1)
                .flatMap(({ models }) => models)
                .filter(
                    (later) =>
                        later.model === model && later.status === 'ready',
                )
                .flatMap(({ changes }) => changes.map(({ path }) => path));
        return listProposalIssues({
            models: proposal.models.map((item) => {
                if (item.status !== 'failed') return item;
                const changed = changedLater(item.model);
                return {
                    ...item,
                    error: changed.length > 0 ? null : item.error,
                    refusals: item.refusals.filter(
                        ({ path }) => !changed.includes(path),
                    ),
                };
            }),
        });
    });

/** "Discarded", or who discarded it and when if that was not its owner. */
export const getDiscardedLabel = (
    by: { name: string; at: Date } | null,
): string =>
    by === null
        ? 'Discarded'
        : `Discarded by ${by.name} · ${formatDistanceToNow(new Date(by.at), { addSuffix: true })}`;
