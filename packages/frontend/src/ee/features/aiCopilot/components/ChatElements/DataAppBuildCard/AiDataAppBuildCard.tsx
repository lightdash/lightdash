import {
    getDataAppBuilderPath,
    type ToolGenerateDataAppOutput,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useAppBuildPoller } from '../../../../../../features/apps/hooks/useAppBuildPoller';
import { getAiAgentThreadQueryKey } from '../../../hooks/useProjectAiAgents';
import { DataAppBuildCard } from './DataAppBuildCard';
import {
    getDataAppBuildCardState,
    isDataAppBuildInProgress,
} from './dataAppBuildCardState';
import { useDataAppCardPreview } from './useDataAppCardPreview';

type Props = {
    metadata: ToolGenerateDataAppOutput['metadata'];
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    compact: boolean;
};

/**
 * The build card under an agent reply. A pending result follows the app's
 * live version at the builder's poll cadence; a terminal result stands on
 * its own. The card never touches the composer.
 */
export const AiDataAppBuildCard: FC<Props> = ({
    metadata,
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    compact,
}) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { appUuid } = metadata;
    const { source, isActive, openPreview } = useDataAppCardPreview({
        projectUuid,
        agentUuid,
        threadUuid,
        messageUuid,
        appUuid,
        // A failed build names no version and can never be on show.
        version: metadata.status === 'error' ? null : metadata.version,
    });
    const state = getDataAppBuildCardState(metadata, source);
    const inProgress = state !== null && isDataAppBuildInProgress(state);
    const isPolling = metadata.status === 'pending' && inProgress;

    // The worker patches the tool result when the build ends; one refetch
    // picks it up so the card no longer depends on the poll.
    const refetchThread = useCallback(() => {
        void queryClient.invalidateQueries({
            queryKey: getAiAgentThreadQueryKey(
                projectUuid,
                agentUuid,
                threadUuid,
            ),
        });
    }, [queryClient, projectUuid, agentUuid, threadUuid]);
    useAppBuildPoller(
        projectUuid,
        appUuid ?? undefined,
        isPolling,
        refetchThread,
    );

    // Open the preview once when a build watched in this session lands.
    // Never on reload, and never again after the user closes it.
    const isReady = state?.kind === 'ready';
    const watchingLiveBuild = source.kind === 'loaded' && inProgress;
    const watchedBuildRef = useRef(false);
    const autoOpenedRef = useRef(false);
    useEffect(() => {
        if (watchingLiveBuild) {
            watchedBuildRef.current = true;
            return;
        }
        if (isReady && watchedBuildRef.current && !autoOpenedRef.current) {
            autoOpenedRef.current = true;
            openPreview();
        }
    }, [watchingLiveBuild, isReady, openPreview]);

    if (!state || !appUuid) return null;

    return (
        <DataAppBuildCard
            state={state}
            compact={compact}
            isActive={isActive}
            onOpenBuilder={() =>
                void navigate(getDataAppBuilderPath(projectUuid, appUuid))
            }
            onView={openPreview}
        />
    );
};
