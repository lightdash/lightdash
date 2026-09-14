import { type ApiAppVersionSummary } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, type FC } from 'react';
import { useAppBuildPoller } from '../../../../../features/apps/hooks/useAppBuildPoller';
import { getThreadUuidFromPathname } from '../../hooks/aiAgentRouting';
import { getAiAgentThreadQueryKey } from '../../hooks/useProjectAiAgents';
import { setPreview, type AiPreview } from '../../store/aiArtifactSlice';
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
    const { projectUuid, agentUuid, threadUuid, appUuid } = watch;
    const launcherThreadUuid = useAiAgentStoreSelector((state) =>
        state.aiAgentLauncher.mode === 'panel-open'
            ? state.aiAgentLauncher.activeThreadId
            : null,
    );

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
                // Never open the preview over a different thread on screen.
                const onScreenThreadUuid =
                    getThreadUuidFromPathname(window.location.pathname) ??
                    launcherThreadUuid;
                if (
                    onScreenThreadUuid === null ||
                    onScreenThreadUuid === threadUuid
                ) {
                    dispatch(
                        setPreview(getLandedPreview(watch, latest.version)),
                    );
                }
            }
            dispatch(removeBuildWatch({ appUuid, version: watch.version }));
        },
        [
            queryClient,
            dispatch,
            launcherThreadUuid,
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
 * too so their threads keep updating.
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
