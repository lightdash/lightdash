import { useCallback, useMemo } from 'react';
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
    const eventEmitter = useMemo(
        () =>
            health?.embedding?.events
                ? new LightdashUiEvent(
                      health.embedding.events,
                      LightdashUiEvent.getTargetOriginFromUrl(),
                  )
                : null,
        [health?.embedding?.events],
    );
    const dispatchEmbedEvent = useCallback(
        <T extends Exact<LightdashEventPayload, T>>(
            eventType: LightdashEventType,
            payload?: T,
        ) => {
            if (!eventEmitter) return false;

            eventEmitter.dispatch(eventType, payload);
            return true;
        },
        [eventEmitter],
    );

    return useMemo(() => ({ dispatchEmbedEvent }), [dispatchEmbedEvent]);
};
