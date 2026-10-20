import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('runtime error observer', () => {
    let cleanup: (() => void) | undefined;
    const originalUrl = window.location.href;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        cleanup?.();
        cleanup = undefined;
        vi.unstubAllGlobals();
        window.history.replaceState(null, '', originalUrl);
    });

    const host = () => ({ postMessage: vi.fn() });
    const asWindow = (target: ReturnType<typeof host>) =>
        target as unknown as Window;

    it('reports a generic runtime exception without exposing error contents', async () => {
        const target = host();
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        cleanup = mountRuntimeErrorObserver(asWindow(target));
        const event = new ErrorEvent('error', {
            message: 'Private query data',
            filename: 'https://private.example/app.js',
            error: new Error('Private error stack'),
        });

        window.dispatchEvent(event);

        expect(target.postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: 'lightdash:sdk:runtime-error' },
            '*',
        );
        expect(event.defaultPrevented).toBe(false);
    });

    it('reports a rejected promise without reading its reason', async () => {
        const target = host();
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        cleanup = mountRuntimeErrorObserver(asWindow(target));
        const event = new Event('unhandledrejection');
        const readReason = vi.fn(() => 'Private rejection data');
        Object.defineProperty(event, 'reason', { get: readReason });

        window.dispatchEvent(event);

        expect(target.postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: 'lightdash:sdk:runtime-error' },
            '*',
        );
        expect(readReason).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('includes only the original valid navigation identity even if the URL changes', async () => {
        const target = host();
        const navigationId = '9eed093d-1b5b-4bbc-a567-76a00f3ed2fb';
        window.history.replaceState(
            null,
            '',
            `/?navigationId=${navigationId}&token=secret`,
        );
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        window.history.replaceState(null, '', '/?navigationId=invalid');
        cleanup = mountRuntimeErrorObserver(asWindow(target));

        window.dispatchEvent(new ErrorEvent('error'));

        expect(target.postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: 'lightdash:sdk:runtime-error', navigationId },
            '*',
        );
    });

    it('deduplicates exceptions and rejections across transport recreation', async () => {
        const target = host();
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        cleanup = mountRuntimeErrorObserver(asWindow(target));
        window.dispatchEvent(new ErrorEvent('error'));
        cleanup = mountRuntimeErrorObserver(asWindow(target));
        window.dispatchEvent(new ErrorEvent('error'));
        window.dispatchEvent(new Event('unhandledrejection'));

        expect(target.postMessage).toHaveBeenCalledTimes(1);
    });

    it('replaces the old observer without allowing its cleanup to remove the new one', async () => {
        const oldTarget = host();
        const target = host();
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        const oldCleanup = mountRuntimeErrorObserver(asWindow(oldTarget));
        cleanup = mountRuntimeErrorObserver(asWindow(target));
        oldCleanup();

        window.dispatchEvent(new ErrorEvent('error'));

        expect(oldTarget.postMessage).not.toHaveBeenCalled();
        expect(target.postMessage).toHaveBeenCalledTimes(1);
    });

    it('ignores resource-load errors and unregisters both listeners on cleanup', async () => {
        const target = host();
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        cleanup = mountRuntimeErrorObserver(asWindow(target));
        window.dispatchEvent(new Event('error'));
        expect(target.postMessage).not.toHaveBeenCalled();
        cleanup();

        window.dispatchEvent(new ErrorEvent('error'));
        window.dispatchEvent(new Event('unhandledrejection'));

        expect(target.postMessage).not.toHaveBeenCalled();
    });

    it('does not propagate a postMessage failure into the app', async () => {
        const target = host();
        target.postMessage.mockImplementation(() => {
            throw new Error('Host unavailable');
        });
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        cleanup = mountRuntimeErrorObserver(asWindow(target));

        expect(() =>
            window.dispatchEvent(new ErrorEvent('error')),
        ).not.toThrow();
        window.dispatchEvent(new ErrorEvent('error'));
        expect(target.postMessage).toHaveBeenCalledTimes(1);
    });

    it('is installed by the postMessage transport and does not stack on recreation', async () => {
        const target = host();
        const { createPostMessageTransport } =
            await import('./postMessageTransport');
        const config = {
            targetWindow: asWindow(target),
            projectUuid: 'project',
        };
        createPostMessageTransport(config);
        createPostMessageTransport(config);
        target.postMessage.mockClear();

        window.dispatchEvent(new ErrorEvent('error'));

        expect(target.postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: 'lightdash:sdk:runtime-error' },
            '*',
        );
    });

    it('does nothing outside a browser', async () => {
        const target = host();
        const { mountRuntimeErrorObserver } = await import('./runtimeErrors');
        vi.stubGlobal('window', undefined);

        cleanup = mountRuntimeErrorObserver(asWindow(target));
        expect(cleanup).toEqual(expect.any(Function));
        expect(target.postMessage).not.toHaveBeenCalled();
    });
});
