import '@testing-library/jest-dom/vitest';
import { beforeAll, vi } from 'vitest';

class ResizeObserverMock {
    observe() {}

    unobserve() {}

    disconnect() {}
}

beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.ResizeObserver =
        ResizeObserverMock as unknown as typeof ResizeObserver;
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    window.HTMLElement.prototype.scrollIntoView = () => {};
});
