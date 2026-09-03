import { useCallback } from 'react';
import { useGetApp } from '../../../../../../features/apps/hooks/useGetApp';
import {
    selectDataAppPreview,
    setPreview,
} from '../../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../../store/hooks';
import { type DataAppBuildCardAppSource } from './dataAppBuildCardState';
import { isDataAppCardActive } from './dataAppPreviewVersion';

type Args = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    appUuid: string | null;
    /** The version this card names; null when it names none. */
    version: number | null;
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
 * What a data app card in the thread shares: the app it reads, whether its
 * version is the one on show, and opening that version in the preview.
 */
export const useDataAppCardPreview = ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    appUuid,
    version,
}: Args) => {
    const dispatch = useAiAgentStoreDispatch();
    const preview = useAiAgentStoreSelector(selectDataAppPreview);
    const appQuery = useGetApp(projectUuid, appUuid ?? undefined);
    const source = toAppSource(appQuery);
    const latestReadyVersion =
        source.kind === 'loaded' ? source.app.latestReadyVersion : null;
    const isActive = isDataAppCardActive({
        preview,
        appUuid,
        version,
        latestReadyVersion,
    });

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
                version,
                // The card's own version is the floor until the app resolves.
                latestReadyVersionAtOpen: latestReadyVersion ?? version,
            }),
        );
    }, [
        dispatch,
        appUuid,
        messageUuid,
        threadUuid,
        projectUuid,
        agentUuid,
        version,
        latestReadyVersion,
    ]);

    return { source, isActive, openPreview };
};
