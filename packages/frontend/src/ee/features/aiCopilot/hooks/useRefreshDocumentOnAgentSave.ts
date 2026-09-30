import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { type AiAgentToolResult } from '../types';
import { getSavedDocumentUuidFromContentToolResult } from '../utils/contentToolResultNavigation';

/**
 * Reloads Document data after the agent saves a Document, so an open reading
 * view shows the new version. An open editor keeps its draft and warns that a
 * newer version exists.
 */
export const useRefreshDocumentOnAgentSave = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return useCallback(
        (toolResult: AiAgentToolResult) => {
            if (!getSavedDocumentUuidFromContentToolResult(toolResult)) return;
            void queryClient.invalidateQueries({
                queryKey: ['document', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['document-versions', projectUuid],
            });
        },
        [projectUuid, queryClient],
    );
};
