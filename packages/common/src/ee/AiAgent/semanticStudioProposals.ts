import {
    type SemanticLayerDraft,
    type SemanticLayerDraftChange,
} from '../../types/semanticStudio';
import type { AiAgentThread } from './index';
import { isToolEditDbtProjectResult } from './schemas/tools/toolEditDbtProjectArgs';
import {
    isToolProposeSemanticLayerChangeResult,
    type SemanticLayerProposal,
} from './schemas/tools/toolSemanticStudioArgs';

/** Proposals in a saved message's tool results. */
export const getSavedProposals = <
    T extends { toolType: string; toolName: string; metadata: unknown },
>(
    toolResults: ReadonlyArray<T>,
): SemanticLayerProposal[] =>
    toolResults
        .filter(isToolProposeSemanticLayerChangeResult)
        .map(({ metadata }) => metadata);

/** Every save of a dbt change in a thread's replies, oldest first. */
export const getDbtSaves = (messages: AiAgentThread['messages']) =>
    messages.flatMap((message) =>
        message.role === 'assistant'
            ? message.toolResults.filter(isToolEditDbtProjectResult)
            : [],
    );

/** Proposals in tool outputs as a run returns them (agent steps, stream parts), before the turn is saved. */
export const getRunProposals = (
    results: ReadonlyArray<{ toolName: string; output: unknown }>,
): SemanticLayerProposal[] =>
    results.flatMap(({ toolName, output }) => {
        const result = {
            toolType: 'built-in',
            toolName,
            metadata:
                output && typeof output === 'object' && 'metadata' in output
                    ? output.metadata
                    : undefined,
        };
        return isToolProposeSemanticLayerChangeResult(result)
            ? [result.metadata]
            : [];
    });

export const getDraftChangeUuids = (
    proposals: ReadonlyArray<Pick<SemanticLayerProposal, 'draftChangeUuid'>>,
): string[] =>
    proposals.flatMap(({ draftChangeUuid }) =>
        draftChangeUuid ? [draftChangeUuid] : [],
    );

/** The line kept as the reply when a turn ends on its card with nothing written, so history and copy still read. */
export const describeSemanticLayerProposals = (
    proposals: Pick<SemanticLayerProposal, 'models'>[],
): string => {
    const ready = proposals.flatMap(({ models }) =>
        models.filter(({ status }) => status === 'ready'),
    );
    if (ready.length === 0) return 'Nothing changed in the draft.';
    const names = [...new Set(ready.map(({ model }) => model))];
    // Only results stored before a model joined whole or not at all.
    const leftOut = ready.some(({ refusals }) => refusals.length > 0)
        ? ' Some parts were left out.'
        : '';
    return `Changed ${names.join(', ')} in the draft.${leftOut}`;
};

/** The reply stored for a turn that ends on its card, and that the chat hides as already shown; null when nothing joined the draft. */
export const getStudioCardReply = (
    proposals: SemanticLayerProposal[],
): string | null => {
    const joined = proposals.filter(
        ({ draftChangeUuid }) => draftChangeUuid !== null,
    );
    return joined.length > 0 ? describeSemanticLayerProposals(joined) : null;
};

/** Whether the agent may end its turn on the card without writing: every proposal joined the draft cleanly. */
export const endsTurnOnCard = (proposals: SemanticLayerProposal[]): boolean =>
    proposals.length > 0 &&
    // A failed model or advice means the agent still has work to do this turn.
    proposals.every(
        ({ draftChangeUuid, models, needsFollowUp }) =>
            draftChangeUuid !== null &&
            !needsFollowUp &&
            models.every(({ status }) => status !== 'failed'),
    );

/** Whether a turn shows its summary card; a turn still working says nothing of an attempt that failed, it may yet land the change. */
export const showsProposalSummary = (
    proposals: SemanticLayerProposal[],
    isStreaming: boolean,
): boolean =>
    proposals.length > 0 &&
    !(
        isStreaming &&
        proposals.every(({ draftChangeUuid }) => !draftChangeUuid)
    );

export type SemanticLayerProposalPhase =
    | { kind: 'in_draft'; changes: SemanticLayerDraftChange[] }
    | { kind: 'applied' }
    | { kind: 'pull_request'; url: string }
    | { kind: 'undone' }
    /** `by` is a project admin who discarded it as stale; null when its owner did. */
    | { kind: 'discarded'; by: { name: string; at: Date } | null }
    /** Not in the draft as read: the agent added it after the last read. */
    | { kind: 'unknown' };

/** Where a set of proposed changes stands in the draft. `latest_applied` takes the pull request of the newest applied change; `any_applied` the newest applied change that has one. */
export const getProposalPhase = (
    draft: SemanticLayerDraft,
    draftChangeUuids: string[],
    { pullRequestFrom }: { pullRequestFrom: 'latest_applied' | 'any_applied' },
): SemanticLayerProposalPhase => {
    const inDraft = draft.changes.filter(({ draftChangeUuid }) =>
        draftChangeUuids.includes(draftChangeUuid),
    );
    if (inDraft.length > 0) return { kind: 'in_draft', changes: inDraft };
    const settled = draft.settled.filter(({ draftChangeUuid }) =>
        draftChangeUuids.includes(draftChangeUuid),
    );
    const applied = settled.filter(({ status }) => status === 'applied');
    if (applied.length > 0) {
        const url =
            pullRequestFrom === 'latest_applied'
                ? applied[0].pullRequestUrl
                : (applied.find(({ pullRequestUrl }) => pullRequestUrl)
                      ?.pullRequestUrl ?? null);
        return url ? { kind: 'pull_request', url } : { kind: 'applied' };
    }
    if (settled.length === 0) return { kind: 'unknown' };
    return settled.every(({ status }) => status === 'undone')
        ? { kind: 'undone' }
        : {
              kind: 'discarded',
              by:
                  settled.find(({ discardedBy }) => discardedBy)?.discardedBy ??
                  null,
          };
};
