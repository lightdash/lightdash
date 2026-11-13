import { isEqual } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';
import useEmbed from '../../../providers/Embed/useEmbed';
import {
    LightdashEventType,
    type ContentStateChangedPayload,
} from '../events/types';

// Lets load-time and typing bursts settle into one event
export const CONTENT_STATE_DEBOUNCE_MS = 300;

/** Emits the content state once it settles and whenever it changes. Null while it isn't ready. */
export const useEmbedContentStateEvent = (
    state: ContentStateChangedPayload | null,
) => {
    const { dispatchEmbedEvent, isEmbedEventReady } = useEmbed();
    const lastEmittedRef = useRef<ContentStateChangedPayload | null>(null);

    useEffect(() => {
        if (!state || !isEmbedEventReady) return;
        if (isEqual(lastEmittedRef.current, state)) return;

        const timeout = setTimeout(() => {
            lastEmittedRef.current = state;
            dispatchEmbedEvent(LightdashEventType.ContentStateChanged, state);
        }, CONTENT_STATE_DEBOUNCE_MS);
        return () => clearTimeout(timeout);
    }, [state, isEmbedEventReady, dispatchEmbedEvent]);
};
