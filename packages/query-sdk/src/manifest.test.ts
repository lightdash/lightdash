import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('manifest navigation identity', () => {
    let cleanup: (() => void) | undefined;
    const originalUrl = window.location.href;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        cleanup?.();
        window.history.replaceState(null, '', originalUrl);
    });

    it('reports the original navigation identity on every manifest without URL secrets', async () => {
        const navigationId = '9eed093d-1b5b-4bbc-a567-76a00f3ed2fb';
        window.history.replaceState(
            null,
            '',
            `/?navigationId=${navigationId}&token=secret`,
        );
        const { announceSdkManifest } = await import('./manifest');
        const target = { postMessage: vi.fn() };
        const targetWindow = target as unknown as Window;
        cleanup = announceSdkManifest(targetWindow);
        window.history.replaceState(
            null,
            '',
            '/?navigationId=invalid&token=changed',
        );
        window.dispatchEvent(
            new MessageEvent('message', {
                source: targetWindow,
                data: { type: 'lightdash:sdk:ready' },
            }),
        );

        expect(target.postMessage).toHaveBeenCalledTimes(2);
        for (const [message, origin] of target.postMessage.mock.calls) {
            expect(message).toEqual({
                type: 'lightdash:sdk:manifest',
                sdkVersion: expect.any(String),
                features: expect.any(Array),
                fixes: expect.any(Array),
                navigationId,
            });
            expect(origin).toBe('*');
        }
    });

    it.each([
        null,
        'not-a-uuid',
        '<script>private content</script>',
        'secret-9eed093d-1b5b-4bbc-a567-76a00f3ed2fb',
    ])(
        'omits absent or invalid navigation identity %s',
        async (navigationId) => {
            const query = new URLSearchParams({ token: 'secret' });
            if (navigationId !== null) query.set('navigationId', navigationId);
            window.history.replaceState(null, '', `/?${query}`);
            const { announceSdkManifest } = await import('./manifest');
            const target = { postMessage: vi.fn() };
            cleanup = announceSdkManifest(target as unknown as Window);

            expect(target.postMessage).toHaveBeenCalledExactlyOnceWith(
                {
                    type: 'lightdash:sdk:manifest',
                    sdkVersion: expect.any(String),
                    features: expect.any(Array),
                    fixes: expect.any(Array),
                },
                '*',
            );
        },
    );
});
