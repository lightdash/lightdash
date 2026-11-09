import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightdashEventType } from '../events/types';
import {
    CONTENT_HEIGHT_THROTTLE_MS,
    useEmbedContentHeightEvent,
} from './useEmbedContentHeightEvent';

const dispatchEmbedEvent = vi.fn();
let isEmbedEventReady = true;
vi.mock('../../../providers/Embed/useEmbed', () => ({
    default: () => ({ dispatchEmbedEvent, isEmbedEventReady }),
}));

let resizeCallback: (() => void) | null = null;
const disconnect = vi.fn();

class MockResizeObserver {
    constructor(callback: () => void) {
        resizeCallback = callback;
    }

    observe() {
        resizeCallback?.();
    }

    disconnect() {
        disconnect();
    }
}

const createElement = (initialHeight: number) => {
    let height = initialHeight;
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ height }) as DOMRect;
    return {
        element,
        resize: (next: number) => {
            height = next;
            resizeCallback?.();
        },
    };
};

describe('useEmbedContentHeightEvent', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
        dispatchEmbedEvent.mockClear();
        disconnect.mockClear();
        isEmbedEventReady = true;
        resizeCallback = null;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('emits the initial height rounded up', () => {
        const { element } = createElement(640.2);
        renderHook(() => useEmbedContentHeightEvent(element));

        expect(dispatchEmbedEvent).toHaveBeenCalledExactlyOnceWith(
            LightdashEventType.ContentHeightChanged,
            { height: 641 },
        );
    });

    it('throttles bursts and emits the final height', () => {
        const { element, resize } = createElement(100);
        renderHook(() => useEmbedContentHeightEvent(element));

        resize(200);
        resize(300);
        resize(400);
        expect(dispatchEmbedEvent).toHaveBeenCalledOnce();

        vi.advanceTimersByTime(CONTENT_HEIGHT_THROTTLE_MS);
        expect(dispatchEmbedEvent).toHaveBeenCalledTimes(2);
        expect(dispatchEmbedEvent).toHaveBeenLastCalledWith(
            LightdashEventType.ContentHeightChanged,
            { height: 400 },
        );
    });

    it('skips resizes that keep the same height', () => {
        const { element, resize } = createElement(100);
        renderHook(() => useEmbedContentHeightEvent(element));

        vi.advanceTimersByTime(CONTENT_HEIGHT_THROTTLE_MS);
        resize(100);
        vi.advanceTimersByTime(CONTENT_HEIGHT_THROTTLE_MS);

        expect(dispatchEmbedEvent).toHaveBeenCalledOnce();
    });

    it('waits for the event system and disconnects on unmount', () => {
        isEmbedEventReady = false;
        const { element } = createElement(100);
        const { rerender, unmount } = renderHook(() =>
            useEmbedContentHeightEvent(element),
        );
        expect(dispatchEmbedEvent).not.toHaveBeenCalled();

        isEmbedEventReady = true;
        rerender();
        expect(dispatchEmbedEvent).toHaveBeenCalledOnce();

        unmount();
        expect(disconnect).toHaveBeenCalledOnce();
    });
});
