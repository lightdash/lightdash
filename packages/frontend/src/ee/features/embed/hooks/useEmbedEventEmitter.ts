import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Exact } from 'type-fest';
import useHealth from '../../../../hooks/health/useHealth';
import { LightdashUiEvent } from '../events/LightdashUiEvent';
import type {
    LightdashEventPayload,
    LightdashEventType,
} from '../events/types';

/**
 * Hook to manage the embed event emitter system.
 * Initializes the event emitter when health data is available and provides
 * a function to dispatch events.
 *
 * @returns Object with dispatch function to emit events
 */
export const useEmbedEventEmitter = () => {
    const { data: health } = useHealth();
    const eventEmitter = useRef<LightdashUiEvent | null>(null);
    const [isEmbedEventReady, setIsEmbedEventReady] = useState(false);

    useEffect(() => {
        if (health?.embedding?.events) {
            eventEmitter.current = new LightdashUiEvent(
                health.embedding.events,
                LightdashUiEvent.getTargetOriginFromUrl(),
            );
            setIsEmbedEventReady(true);
        } else {
            eventEmitter.current = null;
            setIsEmbedEventReady(false);
        }
    }, [health?.embedding?.events]);

    const dispatchEmbedEvent = useCallback(
        <T extends Exact<LightdashEventPayload, T>>(
            eventType: LightdashEventType,
            payload?: T,
        ) => {
            if (!eventEmitter.current) return false;

            eventEmitter.current.dispatch(eventType, payload);
            return true;
        },
        [],
    );

    return useMemo(
        () => ({ dispatchEmbedEvent, isEmbedEventReady }),
        [dispatchEmbedEvent, isEmbedEventReady],
    );
};
