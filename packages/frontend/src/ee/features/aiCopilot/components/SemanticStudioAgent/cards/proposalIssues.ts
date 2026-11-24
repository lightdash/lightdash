import {
    describeModelFragmentRefusal,
    type SemanticLayerProposal,
} from '@lightdash/common';
import {
    IconAlertTriangle,
    IconInfoCircle,
    IconMinus,
    type Icon,
} from '@tabler/icons-react';

export const ISSUE_KINDS = {
    failed: { icon: IconAlertTriangle, color: 'red', label: 'Not added' },
    skipped: { icon: IconMinus, color: 'gray', label: 'Left out' },
    note: { icon: IconInfoCircle, color: 'orange', label: 'Confirm' },
} satisfies Record<string, { icon: Icon; color: string; label: string }>;

export type Issue = {
    kind: keyof typeof ISSUE_KINDS;
    model: string;
    detail: string;
};

/** What in a proposal did not go as asked: models that failed, parts left out, and notes to confirm. */
export const listProposalIssues = (
    proposal: Pick<SemanticLayerProposal, 'models'>,
): Issue[] =>
    proposal.models.flatMap(({ model, error, refusals, notes }) => [
        ...(error ? [{ kind: 'failed' as const, model, detail: error }] : []),
        ...refusals.map((refusal) => ({
            kind: 'skipped' as const,
            model,
            detail: describeModelFragmentRefusal(refusal),
        })),
        ...(notes ?? []).map((detail) => ({
            kind: 'note' as const,
            model,
            detail,
        })),
    ]);

/** A turn's issues across its proposals; a failure the agent went on to fix in the same turn is not one. */
export const listTurnIssues = (
    proposals: Pick<SemanticLayerProposal, 'models'>[],
): Issue[] =>
    proposals.flatMap((proposal, index) =>
        listProposalIssues(proposal).filter(
            ({ kind, model }) =>
                kind !== 'failed' ||
                !proposals
                    .slice(index + 1)
                    .some(({ models }) =>
                        models.some(
                            (later) =>
                                later.model === model &&
                                later.status === 'ready',
                        ),
                    ),
        ),
    );
