import { vi } from 'vitest';

// testing-library only advances fake timers when a jest global exists; without it
// user-event hangs under vi.useFakeTimers(). Scoped: it also makes waitFor advance timers.
export const installFakeTimerBridge = () => {
    Object.assign(globalThis, {
        jest: { advanceTimersByTime: vi.advanceTimersByTime.bind(vi) },
    });
    return () => {
        Reflect.deleteProperty(globalThis, 'jest');
    };
};
