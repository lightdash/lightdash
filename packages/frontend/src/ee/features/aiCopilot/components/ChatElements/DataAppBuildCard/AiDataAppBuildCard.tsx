import {
    getDataAppBuilderPath,
    type ToolGenerateDataAppOutput,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useAppBuildPoller } from '../../../../../../features/apps/hooks/useAppBuildPoller';
import { useGetApp } from '../../../../../../features/apps/hooks/useGetApp';
import { getAiAgentThreadQueryKey } from '../../../hooks/useProjectAiAgents';
import { setPreview } from '../../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../../store/hooks';
import { DataAppBuildCard } from './DataAppBuildCard';
import {
    getDataAppBuildCardState,
    isDataAppBuildInProgress,
    type DataAppBuildCardAppSource,
} from './dataAppBuildCardState';

type Props = {
    metadata: ToolGenerateDataAppOutput['metadata'];
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    compact: boolean;
};

const toAppSource = (
    query: ReturnType<typeof useGetApp>,
): DataAppBuildCardAppSource => {
    const app = query.data?.pages[0];
    if (app) return { kind: 'loaded', app };
    if (query.error) {
        const statusCode = query.error.error?.statusCode;
        return statusCode === 403 || statusCode === 404
            ? { kind: 'unavailable' }
            : { kind: 'error' };
    }
    return { kind: 'loading' };
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
    const dispatch = useAiAgentStoreDispatch();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { appUuid } = metadata;

    const appQuery = useGetApp(projectUuid, appUuid ?? undefined);
    const source = toAppSource(appQuery);
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

    const openPreview = useCallback(() => {
        if (!appUuid) return;
        dispatch(
            setPreview({
                type: 'dataApp',
                appUuid,
                messageUuid,
                threadUuid,
                projectUuid,
                agentUuid,
            }),
        );
    }, [dispatch, appUuid, messageUuid, threadUuid, projectUuid, agentUuid]);

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
            onOpenBuilder={() =>
                void navigate(getDataAppBuilderPath(projectUuid, appUuid))
            }
            onView={openPreview}
        />
    );
};
