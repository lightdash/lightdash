import { LightdashBuildHashHeader } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reloadMock = vi.fn();

const loadHandshake = async () => {
    vi.resetModules();
    return import('./buildHashHandshake');
};

const serverResponse = (buildHash: string | null): Response =>
    new Response(null, {
        headers: buildHash ? { [LightdashBuildHashHeader]: buildHash } : {},
    });

const setServedBuildHash = (buildHash: string | null) => {
    document.head.innerHTML = buildHash
        ? `<meta name="lightdash-build-hash" content="${buildHash}" />`
        : '';
};

describe('buildHashHandshake', () => {
    beforeEach(() => {
        reloadMock.mockClear();
        sessionStorage.clear();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { href: window.location.href, reload: reloadMock },
        });
    });

    it('does not refresh when the served build matches the backend', async () => {
        const { recordServerBuildHash, refreshForBuildSkew } =
            await loadHandshake();
        setServedBuildHash('abc123');

        recordServerBuildHash(serverResponse('abc123'));

        expect(refreshForBuildSkew()).toBe(false);
        expect(reloadMock).not.toHaveBeenCalled();
    });

    it('does not refresh when the backend sends no build hash', async () => {
        const { recordServerBuildHash, refreshForBuildSkew } =
            await loadHandshake();
        setServedBuildHash('abc123');

        recordServerBuildHash(serverResponse(null));

        expect(refreshForBuildSkew()).toBe(false);
        expect(reloadMock).not.toHaveBeenCalled();
    });

    it('does not refresh when the served app has no baked build hash', async () => {
        const { recordServerBuildHash, refreshForBuildSkew } =
            await loadHandshake();
        setServedBuildHash(null);

        recordServerBuildHash(serverResponse('def456'));

        expect(refreshForBuildSkew()).toBe(false);
        expect(reloadMock).not.toHaveBeenCalled();
    });

    it('refreshes once the backend reports a different build', async () => {
        const { recordServerBuildHash, refreshForBuildSkew } =
            await loadHandshake();
        setServedBuildHash('abc123');

        recordServerBuildHash(serverResponse('def456'));

        expect(refreshForBuildSkew()).toBe(true);
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('keeps reporting skew after a later response matches again', async () => {
        const { recordServerBuildHash, refreshForBuildSkew } =
            await loadHandshake();
        setServedBuildHash('abc123');

        recordServerBuildHash(serverResponse('def456'));
        recordServerBuildHash(serverResponse('abc123'));

        expect(refreshForBuildSkew()).toBe(true);
    });

    it('does not refresh twice within the cooldown', async () => {
        const { recordServerBuildHash, refreshForBuildSkew } =
            await loadHandshake();
        setServedBuildHash('abc123');

        recordServerBuildHash(serverResponse('def456'));

        expect(refreshForBuildSkew()).toBe(true);
        expect(refreshForBuildSkew()).toBe(false);
        expect(reloadMock).toHaveBeenCalledTimes(1);
    });
});
