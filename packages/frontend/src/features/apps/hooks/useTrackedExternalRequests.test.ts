import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AppStateEvent } from './useAppSdkBridge';
import { useTrackedAppStateEvents } from './useTrackedExternalRequests';

const makeEvent = (overrides: Partial<AppStateEvent>): AppStateEvent => ({
    id: 'req-1',
    timestamp: Date.now(),
    op: 'get',
    key: null,
    scope: 'all',
    valueSize: null,
    status: 'pending',
    durationMs: null,
    errorCode: null,
    error: null,
    ...overrides,
});

describe('useTrackedAppStateEvents', () => {
    it('drops a late terminal event for a request cleared while pending', () => {
        const { result } = renderHook(() => useTrackedAppStateEvents());

        act(() => {
            result.current.handleAppStateEvent(makeEvent({ id: 'old' }));
        });
        act(() => {
            result.current.clearAppStateEvents();
        });
        expect(result.current.appStateEvents).toHaveLength(0);

        // The fetch behind the cleared entry completes later
        act(() => {
            result.current.handleAppStateEvent(
                makeEvent({ id: 'old', status: 'ready', durationMs: 12 }),
            );
        });
        expect(result.current.appStateEvents).toHaveLength(0);
    });

    it('still tracks new requests after a clear', () => {
        const { result } = renderHook(() => useTrackedAppStateEvents());

        act(() => {
            result.current.handleAppStateEvent(makeEvent({ id: 'old' }));
            result.current.clearAppStateEvents();
            result.current.handleAppStateEvent(makeEvent({ id: 'new' }));
            result.current.handleAppStateEvent(
                makeEvent({ id: 'new', status: 'ready', durationMs: 8 }),
            );
        });

        expect(result.current.appStateEvents).toHaveLength(1);
        expect(result.current.appStateEvents[0]).toMatchObject({
            id: 'new',
            status: 'ready',
        });
    });

    it('does not block completed-then-cleared ids from reappearing as new requests', () => {
        const { result } = renderHook(() => useTrackedAppStateEvents());

        act(() => {
            result.current.handleAppStateEvent(makeEvent({ id: 'r' }));
            result.current.handleAppStateEvent(
                makeEvent({ id: 'r', status: 'ready', durationMs: 5 }),
            );
            result.current.clearAppStateEvents();
            // terminal when cleared → id is free to be tracked again
            result.current.handleAppStateEvent(makeEvent({ id: 'r' }));
        });

        expect(result.current.appStateEvents).toHaveLength(1);
        expect(result.current.appStateEvents[0]).toMatchObject({
            id: 'r',
            status: 'pending',
        });
    });
});
