import { type SemanticLayerDraft } from '@lightdash/common';
import { useEffect } from 'react';
import { useRefreshSemanticLayerDraft } from '../../../../../../features/semanticStudio/useSemanticLayerModel';

/** Reads the draft again when a card names a change it has not seen yet. */
export const useRefreshUnknownDraftChanges = (
    projectUuid: string,
    draft: SemanticLayerDraft | undefined,
    draftChangeUuids: string[],
) => {
    const refresh = useRefreshSemanticLayerDraft(projectUuid);
    // The agent adds to the draft on the server, so a new card means it moved.
    const isUnknown =
        !!draft &&
        draftChangeUuids.some(
            (uuid) =>
                !draft.changes.some((c) => c.draftChangeUuid === uuid) &&
                !draft.settled.some((s) => s.draftChangeUuid === uuid),
        );
    useEffect(() => {
        if (isUnknown) void refresh();
    }, [isUnknown, refresh]);
};
