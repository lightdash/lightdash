import { useEffect, useMemo, useRef } from 'react';
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

    // Initialize event system when health data is available
    useEffect(() => {
        if (health?.embedding?.events) {
            const targetOrigin = LightdashUiEvent.getTargetOriginFromUrl();
            eventEmitter.current = new LightdashUiEvent(
                health.embedding.events,
                targetOrigin,
            );
        }
    }, [health]);

    return useMemo(() => {
        const dispatchEmbedEvent = <T extends Exact<LightdashEventPayload, T>>(
            eventType: LightdashEventType,
            payload?: T,
        ) => {
            if (eventEmitter.current) {
                eventEmitter.current.dispatch(eventType, payload);
            }
        };

        return { dispatchEmbedEvent };
    }, []);
};
