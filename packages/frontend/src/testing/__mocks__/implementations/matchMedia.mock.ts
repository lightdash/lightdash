import { vi } from 'vitest';

function mockMatchMedia() {
    window.matchMedia = vi.fn().mockImplementation((query) => {
        return {
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(), // Deprecated but included for completeness
            removeListener: vi.fn(), // Deprecated but included for completeness
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };
    });
}

export default mockMatchMedia;
