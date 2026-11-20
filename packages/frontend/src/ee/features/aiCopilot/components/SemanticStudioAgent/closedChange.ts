import {
    isToolProposeSemanticLayerChangeResult,
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
    const uuids = thread.messages.flatMap((message) =>
        message.role === 'assistant'
            ? message.toolResults
                  .filter(isToolProposeSemanticLayerChangeResult)
                  .flatMap(({ metadata }) =>
                      metadata.draftChangeUuid
                          ? [metadata.draftChangeUuid]
                          : [],
                  )
            : [],
    );
    const applied = draft.settled.filter(
        ({ draftChangeUuid, status }) =>
            status === 'applied' && uuids.includes(draftChangeUuid),
    );
    if (applied.length === 0) return null;
    return {
        pullRequestUrl:
            applied.find(({ pullRequestUrl }) => pullRequestUrl)
                ?.pullRequestUrl ?? null,
    };
};
