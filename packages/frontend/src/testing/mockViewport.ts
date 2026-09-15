import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Dispatch real media-query subscriptions when a resize test changes width. */
export const mockViewport = (initialWidth: number) => {
    let width = initialWidth;
    const subscriptions = new Map<
        string,
        Set<(event: MediaQueryListEvent) => void>
    >();
    const matches = (query: string) => {
        const min = query.match(/min-width:\s*([\d.]+)(px|em|rem)/);
        const max = query.match(/max-width:\s*([\d.]+)(px|em|rem)/);
        const less = query.match(/width\s*<\s*([\d.]+)(px|em|rem)/);
        const pixels = (match: RegExpMatchArray) =>
            Number(match[1]) * (match[2] === 'px' ? 1 : 16);
        if (min) return width >= pixels(min);
        if (max) return width <= pixels(max);
        if (less) return width < pixels(less);
        return false;
    };
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
        const listeners = subscriptions.get(query) ?? new Set();
        subscriptions.set(query, listeners);
        return {
            matches: matches(query),
            media: query,
            onchange: null,
            addListener: (listener) => {
                if (listener) listeners.add(listener);
            },
            removeListener: (listener) => {
                if (listener) listeners.delete(listener);
            },
            addEventListener: (
                _event: string,
                listener: (event: MediaQueryListEvent) => void,
            ) => listeners.add(listener),
            removeEventListener: (
                _event: string,
                listener: (event: MediaQueryListEvent) => void,
            ) => listeners.delete(listener),
            dispatchEvent: () => true,
        } as MediaQueryList;
    });
    return {
        resize: (nextWidth: number) =>
            act(() => {
                width = nextWidth;
                subscriptions.forEach((listeners, query) =>
                    listeners.forEach((listener) =>
                        listener({
                            matches: matches(query),
                            media: query,
                        } as MediaQueryListEvent),
                    ),
                );
            }),
        restore: () => spy.mockRestore(),
    };
};
