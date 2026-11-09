import { throttle } from 'es-toolkit/compat';
import { useEffect } from 'react';
import useEmbed from '../../../providers/Embed/useEmbed';
import { LightdashEventType } from '../events/types';

// Stays under the default event rate limit of 10 per second
export const CONTENT_HEIGHT_THROTTLE_MS = 150;

/** Emits the element's rendered height whenever it changes. */
export const useEmbedContentHeightEvent = (element: HTMLElement | null) => {
    const { dispatchEmbedEvent, isEmbedEventReady } = useEmbed();

    useEffect(() => {
        if (!element || !isEmbedEventReady) return;

        let lastHeight: number | null = null;
        const emit = throttle(
            () => {
                const height = Math.ceil(
                    element.getBoundingClientRect().height,
                );
                if (height === lastHeight) return;
                lastHeight = height;
                dispatchEmbedEvent(LightdashEventType.ContentHeightChanged, {
                    height,
                });
            },
            CONTENT_HEIGHT_THROTTLE_MS,
            { leading: true, trailing: true },
        );

        const observer = new ResizeObserver(() => emit());
        observer.observe(element);
        return () => {
            observer.disconnect();
            emit.cancel();
        };
    }, [element, isEmbedEventReady, dispatchEmbedEvent]);
};
