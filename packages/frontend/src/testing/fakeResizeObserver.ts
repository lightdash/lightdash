import { act } from '@testing-library/react';

// Delivers observations only to observers still observing the target
export const resizeObservers = new Set<FakeResizeObserver>();
export class FakeResizeObserver implements ResizeObserver {
    targets = new Set<Element>();

    constructor(readonly callback: ResizeObserverCallback) {
        resizeObservers.add(this);
    }

    observe(target: Element) {
        this.targets.add(target);
    }

    unobserve(target: Element) {
        this.targets.delete(target);
    }

    disconnect() {
        this.targets.clear();
        resizeObservers.delete(this);
    }
}
export const fakeResizeObserverEntry = (
    target: Element,
    width: number,
    height: number,
): ResizeObserverEntry => ({
    target,
    contentRect: { width, height } as DOMRectReadOnly,
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
});
export const resizeTarget = (target: Element, width: number, height: number) =>
    act(() => {
        for (const observer of [...resizeObservers]) {
            if (observer.targets.has(target))
                observer.callback(
                    [fakeResizeObserverEntry(target, width, height)],
                    observer,
                );
        }
    });
