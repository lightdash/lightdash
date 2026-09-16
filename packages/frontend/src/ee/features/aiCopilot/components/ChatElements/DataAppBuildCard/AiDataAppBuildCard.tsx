import { type ToolGenerateDataAppOutput } from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import { addBuildWatch } from '../../../store/buildWatchesSlice';
import { useAiAgentStoreDispatch } from '../../../store/hooks';
import { DataAppBuildCard } from './DataAppBuildCard';
import {
    getDataAppBuildCardState,
    isDataAppBuildInProgress,
} from './dataAppBuildCardState';
import { useDataAppCardPreview } from './useDataAppCardPreview';

/** Where the card's metadata came from: the live tool call streamed in this
 *  session, or a tool result persisted on the message (reload, later turns). */
export type DataAppBuildOrigin = 'stream' | 'persisted';

type Props = {
    metadata: ToolGenerateDataAppOutput['metadata'];
    origin: DataAppBuildOrigin;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    compact: boolean;
};

/**
 * The build card under an agent reply. A pending result starts a build watch
 * and follows the app's live version through the watcher's poll; a terminal
 * result stands on its own. The card never touches the composer.
 */
export const AiDataAppBuildCard: FC<Props> = ({
    metadata,
    origin,
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    compact,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const { appUuid } = metadata;
    const { source, isActive, openPreview, openLatestPreview } =
        useDataAppCardPreview({
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
    const pendingVersion =
        metadata.status === 'pending' && inProgress ? metadata.version : null;
    const appName = source.kind === 'loaded' ? source.app.name : null;

    // The app-wide build watcher polls on the card's behalf; re-registering
    // on every render is idempotent.
    useEffect(() => {
        if (pendingVersion === null || !appUuid) {
            return;
        }
        dispatch(
            addBuildWatch({
                appUuid,
                version: pendingVersion,
                projectUuid,
                agentUuid,
                threadUuid,
                messageUuid,
                appName,
            }),
        );
    }, [
        dispatch,
        pendingVersion,
        appUuid,
        projectUuid,
        agentUuid,
        threadUuid,
        messageUuid,
        appName,
    ]);

    // Open the preview once when a build started in this session first shows;
    // the build watcher moves it to the new version when the build lands.
    // Never on reload, and never again after the user closes it.
    const startedThisSession = origin === 'stream' && inProgress;
    const autoOpenedRef = useRef(false);
    useEffect(() => {
        if (startedThisSession && !autoOpenedRef.current) {
            autoOpenedRef.current = true;
            openLatestPreview();
        }
    }, [startedThisSession, openLatestPreview]);

    if (!state || !appUuid) return null;

    return (
        <DataAppBuildCard
            state={state}
            compact={compact}
            isActive={isActive}
            onView={openPreview}
        />
    );
};
