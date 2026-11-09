import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeTimerBridge } from '../../testing/fakeTimerBridge';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderHookWithProviders } from '../../testing/testUtils';
import {
    MAX_FAILED_MINTS,
    MINT_RETRY_DELAYS_MS,
    MOBILE_APP_LINK_POLL_INTERVAL_MS,
    useMobileAppLink,
} from './useMobileAppLink';

vi.mock('../../api');
const api = mockedLightdashApi;

const START = new Date('2026-11-09T12:00:00.000Z').getTime();
const TTL_MS = 30 * 60 * 1000;

const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
    });
    act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
};

type MintMode = 'ok' | 'rate-limited' | 'already-expired';

const mockServer = ({
    scannedAfterPolls,
    browserAheadMs = 0,
    mintMode = 'ok',
}: {
    scannedAfterPolls: number;
    browserAheadMs?: number;
    mintMode?: MintMode;
}) => {
    let mints = 0;
    const statusCalls: string[] = [];
    const serverNow = () => Date.now() - browserAheadMs;
    api.mockImplementation(
        async ({ url, method }: { url: string; method: string }) => {
            if (method === 'POST') {
                mints += 1;
                if (mintMode === 'rate-limited') {
                    throw {
                        status: 'error',
                        error: {
                            name: 'TooManyRequestsError',
                            statusCode: 429,
                            message: 'Too many app links.',
                            data: {},
                        },
                    };
                }
                const lifetimeMs = mintMode === 'already-expired' ? 0 : TTL_MS;
                return {
                    linkUuid: `link-${mints}`,
                    scanUrl: `https://app.example.com/m/app/scan-${mints}`,
                    expiresAt: new Date(serverNow() + lifetimeMs).toISOString(),
                    expiresInSeconds: lifetimeMs / 1000,
                };
            }
            const linkUuid = url.split('/').pop() ?? '';
            statusCalls.push(linkUuid);
            const isScanned = statusCalls.length > scannedAfterPolls;
            return {
                linkUuid,
                expiresAt: new Date(serverNow() + TTL_MS).toISOString(),
                scannedAt: isScanned
                    ? new Date(serverNow()).toISOString()
                    : null,
                scanPlatform: isScanned ? 'ios' : null,
            };
        },
    );
    return {
        mintCount: () => mints,
        statusCalls,
    };
};

const advance = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });

let uninstallBridge: () => void;

beforeEach(() => {
    vi.useFakeTimers({ now: START, shouldAdvanceTime: false });
    uninstallBridge = installFakeTimerBridge();
    setVisibility('visible');
    api.mockReset();
});

afterEach(() => {
    uninstallBridge();
    vi.useRealTimers();
});

describe('useMobileAppLink', () => {
    it('mints a link on mount and polls until a phone opens it', async () => {
        const server = mockServer({ scannedAfterPolls: 2 });
        const { result } = renderHookWithProviders(() => useMobileAppLink());

        await waitFor(() =>
            expect(result.current.link?.linkUuid).toBe('link-1'),
        );
        await act(async () => {
            await vi.advanceTimersByTimeAsync(
                MOBILE_APP_LINK_POLL_INTERVAL_MS * 3,
            );
        });
        await waitFor(() => expect(result.current.isScanned).toBe(true));

        const pollsAtScan = server.statusCalls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(
                MOBILE_APP_LINK_POLL_INTERVAL_MS * 5,
            );
        });
        expect(server.statusCalls).toHaveLength(pollsAtScan);
        expect(server.mintCount()).toBe(1);
    });

    it('mints a new link at expiry and swaps it in place', async () => {
        const server = mockServer({ scannedAfterPolls: Infinity });
        const { result } = renderHookWithProviders(() => useMobileAppLink());
        await waitFor(() =>
            expect(result.current.link?.linkUuid).toBe('link-1'),
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(TTL_MS + 1000);
        });

        await waitFor(() =>
            expect(result.current.link?.linkUuid).toBe('link-2'),
        );
        expect(server.mintCount()).toBe(2);
    });

    it('pauses polling and refresh while the tab is hidden', async () => {
        const server = mockServer({ scannedAfterPolls: Infinity });
        const { result } = renderHookWithProviders(() => useMobileAppLink());
        await waitFor(() =>
            expect(result.current.link?.linkUuid).toBe('link-1'),
        );

        setVisibility('hidden');
        const pollsWhenHidden = server.statusCalls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(TTL_MS + 60_000);
        });
        expect(server.statusCalls).toHaveLength(pollsWhenHidden);
        expect(server.mintCount()).toBe(1);

        setVisibility('visible');
        await waitFor(() =>
            expect(result.current.link?.linkUuid).toBe('link-2'),
        );
    });

    it.each([
        ['ahead of', 31],
        ['behind', -31],
    ])(
        'mints once and refreshes near the real expiry with the browser clock 31 minutes %s the server',
        async (_label, minutes) => {
            const browserAheadMs = minutes * 60 * 1000;
            vi.setSystemTime(START + browserAheadMs);
            const server = mockServer({
                scannedAfterPolls: Infinity,
                browserAheadMs,
            });
            const { result } = renderHookWithProviders(() =>
                useMobileAppLink(),
            );
            await waitFor(() =>
                expect(result.current.link?.linkUuid).toBe('link-1'),
            );

            await advance(2 * 60 * 1000);
            expect(server.mintCount()).toBe(1);

            await advance(TTL_MS - 2 * 60 * 1000 - 1000);
            expect(server.mintCount()).toBe(1);

            await advance(2000);
            await waitFor(() =>
                expect(result.current.link?.linkUuid).toBe('link-2'),
            );
            expect(server.mintCount()).toBe(2);
            expect(result.current.hasFailed).toBe(false);
        },
    );

    it.each<[string, MintMode]>([
        ['rate limited', 'rate-limited'],
        ['already expired', 'already-expired'],
    ])(
        'backs off, then stops after %s mints and waits for Try again',
        async (_label, mintMode) => {
            const server = mockServer({
                scannedAfterPolls: Infinity,
                mintMode,
            });
            const { result } = renderHookWithProviders(() =>
                useMobileAppLink(),
            );
            await waitFor(() => expect(server.mintCount()).toBe(1));

            await advance(MINT_RETRY_DELAYS_MS[0] - 1000);
            expect(server.mintCount()).toBe(1);
            await advance(1000);
            await waitFor(() => expect(server.mintCount()).toBe(2));

            await advance(MINT_RETRY_DELAYS_MS[1]);
            await waitFor(() =>
                expect(server.mintCount()).toBe(MAX_FAILED_MINTS),
            );
            await waitFor(() => expect(result.current.hasFailed).toBe(true));

            await advance(60 * 60 * 1000);
            expect(server.mintCount()).toBe(MAX_FAILED_MINTS);
            expect(result.current.link).toBeNull();

            act(() => result.current.retry());
            await waitFor(() =>
                expect(server.mintCount()).toBe(MAX_FAILED_MINTS + 1),
            );
        },
    );
});
