import { type SemanticLayerProposal } from '@lightdash/common';
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
export const listProposalIssues = (proposal: SemanticLayerProposal): Issue[] =>
    proposal.models.flatMap(({ model, error, refusals, notes }) => [
        ...(error ? [{ kind: 'failed' as const, model, detail: error }] : []),
        ...refusals.map(({ path, reason }) => ({
            kind: 'skipped' as const,
            model,
            detail: `${path}: ${reason.replaceAll('_', ' ')}`,
        })),
        ...(notes ?? []).map((detail) => ({
            kind: 'note' as const,
            model,
            detail,
        })),
    ]);
