import { type MouseEvent } from 'react';
import { selectDataAppPreview, setPreview } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';

export const isPlainLeftClick = (e: MouseEvent<HTMLAnchorElement>) =>
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.shiftKey;

export type DataAppPreviewScope = {
    messageUuid: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
};

// Plain click opens the app's latest ready version in the in-thread preview
// panel; modified clicks fall through to the anchor and open the full page.
export const useDataAppPreviewLink = (
    appUuid: string | null,
    scope: DataAppPreviewScope | null,
) => {
    const dispatch = useAiAgentStoreDispatch();
    const currentPreview = useAiAgentStoreSelector(selectDataAppPreview);
    const isActive =
        appUuid !== null &&
        currentPreview !== null &&
        currentPreview.appUuid === appUuid;

    const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
        if (!appUuid || !scope || !isPlainLeftClick(e)) return;
        e.preventDefault();
        dispatch(
            setPreview({
                type: 'dataApp',
                appUuid,
                ...scope,
                version: null,
                latestReadyVersionAtOpen: null,
            }),
        );
    };

    return { isActive, onClick };
};
