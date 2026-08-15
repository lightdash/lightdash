import { LightdashBuildHashHeader } from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reloadMock = vi.fn();
const SKEW_RELOAD_KEY = 'lightdash-build-skew-reload';
const RELOAD_COOLDOWN_MS = 60_000;
const MAX_SKEW_RELOADS = 2;
const START_TIME = 1_700_000_000_000;

let currentTime = START_TIME;

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
        currentTime = START_TIME;
        vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { href: window.location.href, reload: reloadMock },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

    it('clears the reload guard once a reloaded app converges with the backend', async () => {
        const stale = await loadHandshake();
        setServedBuildHash('abc123');
        stale.recordServerBuildHash(serverResponse('def456'));

        expect(stale.refreshForBuildSkew()).toBe(true);
        expect(sessionStorage.getItem(SKEW_RELOAD_KEY)).not.toBeNull();

        const converged = await loadHandshake();
        setServedBuildHash('def456');
        converged.recordServerBuildHash(serverResponse('def456'));

        expect(sessionStorage.getItem(SKEW_RELOAD_KEY)).toBeNull();
        expect(converged.refreshForBuildSkew()).toBe(false);

        const skewedAgain = await loadHandshake();
        setServedBuildHash('def456');
        skewedAgain.recordServerBuildHash(serverResponse('ghi789'));

        expect(skewedAgain.refreshForBuildSkew()).toBe(true);
        expect(reloadMock).toHaveBeenCalledTimes(2);
    });

    it('stops auto-reloading after the attempt cap and does not resume when the cooldown expires', async () => {
        const reloadOnPermanentSkew = async () => {
            const handshake = await loadHandshake();
            setServedBuildHash('abc123');
            handshake.recordServerBuildHash(serverResponse('def456'));
            return handshake.refreshForBuildSkew();
        };

        expect(await reloadOnPermanentSkew()).toBe(true);
        currentTime += RELOAD_COOLDOWN_MS + 1;

        expect(await reloadOnPermanentSkew()).toBe(true);
        currentTime += RELOAD_COOLDOWN_MS + 1;

        expect(reloadMock).toHaveBeenCalledTimes(MAX_SKEW_RELOADS);

        expect(await reloadOnPermanentSkew()).toBe(false);

        currentTime += RELOAD_COOLDOWN_MS * 100;

        expect(await reloadOnPermanentSkew()).toBe(false);
        expect(reloadMock).toHaveBeenCalledTimes(MAX_SKEW_RELOADS);
    });

    it('does not auto-refresh when session storage cannot be read', async () => {
        const { recordServerBuildHash, refreshForBuildSkew } =
            await loadHandshake();
        setServedBuildHash('abc123');
        recordServerBuildHash(serverResponse('def456'));

        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage disabled');
        });

        expect(refreshForBuildSkew()).toBe(false);
        expect(reloadMock).not.toHaveBeenCalled();
    });
});
