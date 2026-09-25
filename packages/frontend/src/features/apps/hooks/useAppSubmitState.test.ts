import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppSubmitState } from './useAppSubmitState';

// The browser runs the startViewTransition callback asynchronously, after the
// submit handler's synchronous body (including `finally`) has completed.
const installDeferredViewTransition = () => {
    const queued: Array<() => void> = [];
    const startViewTransition = vi.fn((callback: () => void) => {
        queued.push(callback);
        return { finished: Promise.resolve() };
    });
    Object.assign(document, { startViewTransition });
    return {
        startViewTransition,
        flush: () =>
            act(() => {
                queued.splice(0).forEach((callback) => callback());
            }),
    };
};

const deferred = () => {
    let resolve: () => void = () => {};
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
};

describe('useAppSubmitState', () => {
    afterEach(() => {
        Reflect.deleteProperty(document, 'startViewTransition');
    });

    it('settles after a text-only first build once the deferred transition runs', () => {
        const transition = installDeferredViewTransition();
        const { result } = renderHook(() => useAppSubmitState());

        act(() => {
            result.current.begin({ fromLanding: true });
            expect(result.current.isInFlight()).toBe(true);
            result.current.end();
        });
        expect(result.current.isInFlight()).toBe(false);
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isLeavingLanding).toBe(true);

        transition.flush();

        expect(transition.startViewTransition).toHaveBeenCalledTimes(1);
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isLeavingLanding).toBe(false);
    });

    it('settles after a first build that awaited a file upload', async () => {
        const transition = installDeferredViewTransition();
        const { result } = renderHook(() => useAppSubmitState());
        const upload = deferred();

        let submit: Promise<void> = Promise.resolve();
        act(() => {
            submit = (async () => {
                result.current.begin({ fromLanding: true });
                try {
                    await upload.promise;
                } finally {
                    result.current.end();
                }
            })();
        });
        expect(result.current.isSubmitting).toBe(true);
        expect(result.current.isLeavingLanding).toBe(true);

        // The transition callback fires while the upload is still in flight.
        transition.flush();
        expect(result.current.isSubmitting).toBe(true);
        expect(result.current.isLeavingLanding).toBe(false);

        await act(async () => {
            upload.resolve();
            await submit;
        });
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isLeavingLanding).toBe(false);
    });

    it('settles after a follow-up submit on an existing app without a transition', () => {
        const transition = installDeferredViewTransition();
        const { result } = renderHook(() => useAppSubmitState());

        act(() => {
            result.current.begin({ fromLanding: false });
            result.current.end();
        });

        expect(transition.startViewTransition).not.toHaveBeenCalled();
        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isLeavingLanding).toBe(false);
    });

    it('settles when the View Transition API is unavailable', () => {
        const { result } = renderHook(() => useAppSubmitState());

        act(() => {
            result.current.begin({ fromLanding: true });
            result.current.end();
        });

        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.isLeavingLanding).toBe(false);
    });

    it('raises isSubmitting synchronously so the composer locks at once', () => {
        installDeferredViewTransition();
        const { result } = renderHook(() => useAppSubmitState());

        act(() => {
            result.current.begin({ fromLanding: true });
        });

        expect(result.current.isSubmitting).toBe(true);
        expect(result.current.isLeavingLanding).toBe(true);
    });
});
