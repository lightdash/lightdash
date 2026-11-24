import {
    getDraftChangeUuids,
    getProposalPhase,
    getSavedProposals,
    type ApiAiAgentThreadResponse,
    type SemanticLayerDraft,
} from '@lightdash/common';

export type ClosedChange = { pullRequestUrl: string | null };

/** The chat's change once it has left the draft, published or sent as a pull request; null while there is still work in it. */
export const getClosedChange = (
    thread: ApiAiAgentThreadResponse['results'],
    draft: SemanticLayerDraft | undefined,
): ClosedChange | null => {
    if (!draft || draft.changes.length > 0) return null;
    const proposals = thread.messages.flatMap((message) =>
        message.role === 'assistant'
            ? getSavedProposals(message.toolResults)
            : [],
    );
    const phase = getProposalPhase(draft, getDraftChangeUuids(proposals), {
        pullRequestFrom: 'any_applied',
    });
    if (phase.kind === 'pull_request') return { pullRequestUrl: phase.url };
    return phase.kind === 'applied' ? { pullRequestUrl: null } : null;
};
