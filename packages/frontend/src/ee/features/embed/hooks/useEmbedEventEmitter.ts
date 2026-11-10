import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useHealth from '../../../../hooks/health/useHealth';
import { type EmbedMode } from '../../../providers/Embed/types';
import { LightdashUiEvent } from '../events/LightdashUiEvent';
import type {
    DispatchEmbedEvent,
    LightdashEvent,
    LightdashEventHandler,
} from '../events/types';

/**
 * Creates the embed's single event dispatcher. Owned by EmbedProvider.
 * SDK embeds deliver to the host's onEvent callback; direct embeds dispatch
 * DOM/postMessage events once the emitter is initialized from the health config.
 */
export const useCreateEmbedEventEmitter = (
    mode: EmbedMode,
    onEvent: LightdashEventHandler | undefined,
) => {
    const { data: health } = useHealth();
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;
    const eventEmitter = useRef<LightdashUiEvent | null>(null);
    const [isEmitterReady, setIsEmitterReady] = useState(false);
    const eventsConfig =
        mode === 'direct' ? health?.embedding?.events : undefined;

    useEffect(() => {
        if (eventsConfig) {
            eventEmitter.current = new LightdashUiEvent(
                eventsConfig,
                LightdashUiEvent.getTargetOriginFromUrl(),
            );
            setIsEmitterReady(true);
        } else {
            eventEmitter.current = null;
            setIsEmitterReady(false);
        }
    }, [eventsConfig]);

    const dispatchEmbedEvent = useCallback<DispatchEmbedEvent>(
        (eventType, payload) => {
            if (mode === 'sdk') {
                if (!onEventRef.current) return false;
                onEventRef.current({
                    type: eventType,
                    payload,
                } as LightdashEvent);
                return true;
            }

            if (!eventEmitter.current) return false;
            eventEmitter.current.dispatch(eventType, payload);
            return true;
        },
        [mode],
    );

    const isEmbedEventReady =
        mode === 'sdk' ? onEvent !== undefined : isEmitterReady;

    return useMemo(
        () => ({ dispatchEmbedEvent, isEmbedEventReady }),
        [dispatchEmbedEvent, isEmbedEventReady],
    );
};
