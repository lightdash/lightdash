import { vi } from 'vitest';

// Every observed element counts as on screen, so lazily mounted content renders.
class IntersectingObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
        this.callback(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
        );
    }

    unobserve() {}

    disconnect() {}
}

function mockIntersectingObserver() {
    vi.stubGlobal('IntersectionObserver', IntersectingObserver);
}

export default mockIntersectingObserver;
