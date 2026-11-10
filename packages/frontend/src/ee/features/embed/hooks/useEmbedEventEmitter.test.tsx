import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LightdashEventType } from '../events/types';
import { useCreateEmbedEventEmitter } from './useEmbedEventEmitter';

const mockHealth = vi.hoisted(() => ({
    data: undefined as unknown,
}));
vi.mock('../../../../hooks/health/useHealth', () => ({
    default: () => mockHealth,
}));

const eventsConfig = {
    enabled: true,
    enablePostMessage: false,
    allowedOrigins: [],
    rateLimiting: { maxEventsPerWindow: 10, windowDurationMs: 1000 },
};

describe('useCreateEmbedEventEmitter', () => {
    it('delivers SDK events to onEvent only, without the server event config', () => {
        mockHealth.data = { embedding: { events: eventsConfig } };
        const domListener = vi.fn();
        window.addEventListener('lightdash:tabChanged', domListener);
        const onEvent = vi.fn();
        const { result } = renderHook(() =>
            useCreateEmbedEventEmitter('sdk', onEvent),
        );

        expect(result.current.isEmbedEventReady).toBe(true);
        expect(
            result.current.dispatchEmbedEvent(LightdashEventType.TabChanged, {
                tabIndex: 1,
            }),
        ).toBe(true);
        expect(onEvent).toHaveBeenCalledWith({
            type: 'tabChanged',
            payload: { tabIndex: 1 },
        });
        expect(domListener).not.toHaveBeenCalled();
        window.removeEventListener('lightdash:tabChanged', domListener);
    });

    it('drops SDK events when the host passes no onEvent', () => {
        mockHealth.data = undefined;
        const { result } = renderHook(() =>
            useCreateEmbedEventEmitter('sdk', undefined),
        );

        expect(result.current.isEmbedEventReady).toBe(false);
        expect(
            result.current.dispatchEmbedEvent(LightdashEventType.TabChanged, {
                tabIndex: 1,
            }),
        ).toBe(false);
    });

    it('dispatches direct embed events as DOM events once configured', () => {
        mockHealth.data = { embedding: { events: eventsConfig } };
        const domListener = vi.fn();
        window.addEventListener('lightdash:tabChanged', domListener);
        const { result } = renderHook(() =>
            useCreateEmbedEventEmitter('direct', undefined),
        );

        expect(result.current.isEmbedEventReady).toBe(true);
        result.current.dispatchEmbedEvent(LightdashEventType.TabChanged, {
            tabIndex: 1,
        });
        expect(domListener).toHaveBeenCalledTimes(1);
        window.removeEventListener('lightdash:tabChanged', domListener);
    });
});
