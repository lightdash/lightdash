import { type ApiAppVersionSummary } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { useStore } from 'react-redux';
import { useNavigate } from 'react-router';
import { useAppBuildPoller } from '../../../../../features/apps/hooks/useAppBuildPoller';
import {
    getBuildOutcome,
    useBuildNotification,
} from '../../../../../features/apps/hooks/useBuildNotification';
import {
    getAiAgentThreadPath,
    getThreadUuidFromPathname,
    isEmbedAiAgentRoute,
} from '../../hooks/aiAgentRouting';
import { getAiAgentThreadQueryKey } from '../../hooks/useProjectAiAgents';
import { type AiAgentStoreState } from '../../store';
import {
    selectDataAppPreview,
    setPreview,
    type AiPreview,
} from '../../store/aiArtifactSlice';
import {
    getBuildWatchKey,
    removeBuildWatch,
    selectBuildWatches,
    type BuildWatch as BuildWatchEntry,
} from '../../store/buildWatchesSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';

/** A watch whose app stops answering (deleted, forbidden) is dropped. */
const BUILD_WATCH_TIMEOUT_MS = 30 * 60 * 1000;

const getLandedPreview = (
    {
        appUuid,
        messageUuid,
        threadUuid,
        projectUuid,
        agentUuid,
    }: BuildWatchEntry,
    version: number,
): AiPreview => ({
    type: 'dataApp',
    appUuid,
    messageUuid,
    threadUuid,
    projectUuid,
    agentUuid,
    version,
    latestReadyVersionAtOpen: version,
});

type BuildWatchProps = { watch: BuildWatchEntry };

/** Follows one build watch: polls the app until its outcome lands. */
const BuildWatch: FC<BuildWatchProps> = ({ watch }) => {
    const queryClient = useQueryClient();
    const dispatch = useAiAgentStoreDispatch();
    const store = useStore<AiAgentStoreState>();
    const navigate = useNavigate();
    const { projectUuid, agentUuid, threadUuid, appUuid } = watch;
    const canNotify = !isEmbedAiAgentRoute();
    const landedReadyVersionRef = useRef<number | null>(null);

    const openThread = useCallback(() => {
        if (getThreadUuidFromPathname(window.location.pathname) === threadUuid)
            return;
        void navigate(getAiAgentThreadPath(projectUuid, agentUuid, threadUuid));
        const version = landedReadyVersionRef.current;
        if (version === null) return;
        // Deferred so the outgoing thread's cleanup (clearPreview) runs first.
        setTimeout(() => {
            dispatch(setPreview(getLandedPreview(watch, version)));
        }, 0);
    }, [navigate, dispatch, watch, projectUuid, agentUuid, threadUuid]);

    // Requests permission on mount, i.e. when the watch starts.
    const notify = useBuildNotification({
        appUuid,
        appName: watch.appName ?? 'Data app',
        shouldRequestPermission: canNotify,
        onClick: openThread,
    });

    const onDone = useCallback(
        (latest: ApiAppVersionSummary) => {
            // The build ended and its tool result is patched; refetch the thread.
            void queryClient.invalidateQueries({
                queryKey: getAiAgentThreadQueryKey(
                    projectUuid,
                    agentUuid,
                    threadUuid,
                ),
            });
            // The poll carries the newest version; a newer one means this
            // watch is stale and only gets dropped.
            const isWatchedVersion = latest.version === watch.version;
            if (isWatchedVersion && latest.status === 'ready') {
                landedReadyVersionRef.current = latest.version;
                // Only a panel still showing this app follows the build;
                // a closed panel stays closed.
                const preview = selectDataAppPreview(store.getState());
                if (
                    preview?.appUuid === appUuid &&
                    preview.threadUuid === threadUuid
                ) {
                    dispatch(
                        setPreview(getLandedPreview(watch, latest.version)),
                    );
                }
            }
            dispatch(removeBuildWatch({ appUuid, version: watch.version }));
            if (isWatchedVersion && canNotify) notify(getBuildOutcome(latest));
        },
        [
            queryClient,
            store,
            dispatch,
            notify,
            canNotify,
            projectUuid,
            agentUuid,
            threadUuid,
            appUuid,
            watch,
        ],
    );

    useAppBuildPoller(projectUuid, appUuid, true, onDone);

    useEffect(() => {
        const timeout = setTimeout(() => {
            dispatch(removeBuildWatch({ appUuid, version: watch.version }));
        }, BUILD_WATCH_TIMEOUT_MS);
        return () => clearTimeout(timeout);
    }, [dispatch, appUuid, watch.version]);

    return null;
};

/**
 * The build watcher: one poller per build watch, app-wide. Runs on embeds
 * too so their threads keep updating; only notifications are held there.
 */
export const AiAgentBuildWatcher: FC = () => {
    const watches = useAiAgentStoreSelector(selectBuildWatches);
    return (
        <>
            {watches.map((watch) => (
                <BuildWatch key={getBuildWatchKey(watch)} watch={watch} />
            ))}
        </>
    );
};
