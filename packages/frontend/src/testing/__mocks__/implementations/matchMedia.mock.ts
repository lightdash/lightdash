import { vi } from 'vitest';

function mockMatchMedia() {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        // Made with its implementation, so a test that spies on it and calls mockRestore gets it back
        value: vi.fn((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}

export default mockMatchMedia;
