import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeTimerBridge } from '../../testing/fakeTimerBridge';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderHookWithProviders } from '../../testing/testUtils';
import {
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

const mockServer = ({ scannedAfterPolls }: { scannedAfterPolls: number }) => {
    let mints = 0;
    const statusCalls: string[] = [];
    api.mockImplementation(
        async ({ url, method }: { url: string; method: string }) => {
            if (method === 'POST') {
                mints += 1;
                return {
                    linkUuid: `link-${mints}`,
                    scanUrl: `https://app.example.com/m/app/scan-${mints}`,
                    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
                };
            }
            const linkUuid = url.split('/').pop() ?? '';
            statusCalls.push(linkUuid);
            const isScanned = statusCalls.length > scannedAfterPolls;
            return {
                linkUuid,
                expiresAt: new Date(START + TTL_MS).toISOString(),
                scannedAt: isScanned ? new Date().toISOString() : null,
                scanPlatform: isScanned ? 'ios' : null,
            };
        },
    );
    return {
        mintCount: () => mints,
        statusCalls,
    };
};

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
});
