import {
    MobileSignInCodeStatus,
    MobileSignInRefusal,
    type ApiError,
} from '@lightdash/common';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeTimerBridge } from '../../testing/fakeTimerBridge';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderHookWithProviders } from '../../testing/testUtils';
import {
    MOBILE_SIGN_IN_IDLE_LIMIT_MS,
    MOBILE_SIGN_IN_POLL_INTERVAL_MS,
    useMobileSignInCode,
} from './useMobileSignInCode';

vi.mock('../../api');
const api = mockedLightdashApi;

const START = new Date('2026-11-09T12:00:00.000Z').getTime();
const TTL_MS = 120_000;
const CLAIM_MS = 300_000;

type Call = { url: string; method: string; body: unknown };

const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
    });
    act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
};

const parseBody = (body: unknown) => {
    if (typeof body !== 'string') return body;
    try {
        return JSON.parse(body);
    } catch {
        return body;
    }
};

const mockServer = ({
    claimAfterPolls = Infinity,
    mintError,
}: { claimAfterPolls?: number; mintError?: ApiError } = {}) => {
    const calls: Call[] = [];
    let mints = 0;
    let polls = 0;
    let approved = false;
    const expiries = new Map<string, string>();
    api.mockImplementation(
        async ({
            url,
            method,
            body,
        }: {
            url: string;
            method: string;
            body: unknown;
        }) => {
            calls.push({ url, method, body: parseBody(body) });
            if (method === 'POST' && url === '/user/mobile/sign-in-codes') {
                if (mintError) throw mintError;
                mints += 1;
                const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
                expiries.set(`code-${mints}`, expiresAt);
                return {
                    codeUuid: `code-${mints}`,
                    signInUrl: `https://app.example.com/m/sign-in#c=code-${mints}`,
                    approvalNonce: `nonce-${mints}`,
                    expiresAt,
                    expiresInSeconds: TTL_MS / 1000,
                };
            }
            if (method === 'POST' && url.endsWith('/approve')) {
                approved = true;
                return {
                    status: MobileSignInCodeStatus.APPROVED,
                    matchNumber: '47',
                };
            }
            if (method === 'DELETE') return undefined;
            const codeUuid = url.split('/').pop() ?? '';
            polls += 1;
            const isClaimed = polls > claimAfterPolls;
            if (!isClaimed) {
                return {
                    codeUuid,
                    status: MobileSignInCodeStatus.PENDING,
                    expiresAt: expiries.get(codeUuid),
                    matchNumber: null,
                    device: null,
                };
            }
            return {
                codeUuid,
                status: approved
                    ? MobileSignInCodeStatus.APPROVED
                    : MobileSignInCodeStatus.CLAIMED,
                expiresAt: new Date(START + CLAIM_MS).toISOString(),
                matchNumber: '47',
                device: { platform: 'ios', clientName: 'Lightdash iOS' },
            };
        },
    );
    const of = (method: string, match: (url: string) => boolean) =>
        calls.filter((call) => call.method === method && match(call.url));
    return {
        mints: () =>
            of('POST', (url) => url === '/user/mobile/sign-in-codes').map(
                (call) => call.body,
            ),
        polls: () => of('GET', () => true).length,
        deletes: () => of('DELETE', () => true).map((call) => call.url),
        approvals: () =>
            of('POST', (url) => url.endsWith('/approve')).map(
                (call) => call.body,
            ),
    };
};

const advance = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
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

describe('useMobileSignInCode', () => {
    it('keeps the code hidden until Show code, then mints and polls', async () => {
        const server = mockServer();
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 3);
        expect(result.current.phase).toBe('hidden');
        expect(server.mints()).toEqual([]);

        act(() => result.current.show());
        await waitFor(() => expect(result.current.phase).toBe('showing'));
        expect(server.mints()).toEqual([{ reason: 'show' }]);
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 3);
        expect(server.polls()).toBeGreaterThanOrEqual(3);
    });

    it('mints a new code at expiry and marks it as new', async () => {
        const server = mockServer();
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-1'),
        );

        await advance(TTL_MS + 1000);
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-2'),
        );
        expect(server.mints()).toEqual([
            { reason: 'show' },
            { reason: 'auto_refresh' },
        ]);
        expect(result.current.phase).toBe('showing');
        expect(result.current.isRefreshed).toBe(true);
    });

    it('pauses polling and refresh while the tab is hidden', async () => {
        const server = mockServer();
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-1'),
        );

        setVisibility('hidden');
        const pollsWhenHidden = server.polls();
        await advance(TTL_MS * 2);
        expect(server.polls()).toBe(pollsWhenHidden);
        expect(server.mints()).toHaveLength(1);

        setVisibility('visible');
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-2'),
        );
    });

    it('stops after 15 minutes with no claim and hides the code again', async () => {
        const server = mockServer();
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await waitFor(() => expect(result.current.phase).toBe('showing'));

        for (let elapsed = 0; elapsed <= MOBILE_SIGN_IN_IDLE_LIMIT_MS; ) {
            // eslint-disable-next-line no-await-in-loop
            await advance(60_000);
            elapsed += 60_000;
        }
        await waitFor(() => expect(result.current.phase).toBe('hidden'));
        const mintsAtStop = server.mints().length;
        expect(mintsAtStop).toBeLessThanOrEqual(9);
        expect(server.deletes()).not.toHaveLength(0);

        await advance(TTL_MS * 3);
        expect(server.mints()).toHaveLength(mintsAtStop);
    }, 60_000);

    it('stops refreshing once a phone claims the code and approves with the nonce', async () => {
        const server = mockServer({ claimAfterPolls: 1 });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 2);
        await waitFor(() => expect(result.current.phase).toBe('claimed'));
        expect(result.current.state?.matchNumber).toBe('47');

        await advance(TTL_MS + 1000);
        expect(result.current.phase).toBe('claimed');
        expect(server.mints()).toHaveLength(1);

        act(() => result.current.approve());
        await waitFor(() => expect(result.current.phase).toBe('approved'));
        expect(server.approvals()).toEqual([{ nonce: 'nonce-1' }]);
    });

    it('reports the expiry of a claimed code', async () => {
        mockServer({ claimAfterPolls: 1 });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 2);
        await waitFor(() => expect(result.current.phase).toBe('claimed'));
        await advance(CLAIM_MS + 1000);
        await waitFor(() => expect(result.current.phase).toBe('expired'));
    });

    it('exposes the policy refusal from the server', async () => {
        mockServer({
            mintError: {
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message: 'Sign-in codes are not available',
                    data: {
                        reason: MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED,
                    },
                },
            },
        });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await waitFor(() => expect(result.current.phase).toBe('refused'));
        expect(result.current.refusal).toBe(
            MobileSignInRefusal.MANAGED_SIGN_IN_REQUIRED,
        );
    });

    it('cancels the code on Hide code and when the page closes', async () => {
        const server = mockServer();
        const { result, unmount } = renderHookWithProviders(() =>
            useMobileSignInCode(),
        );
        act(() => result.current.show());
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-1'),
        );
        act(() => result.current.hide());
        await waitFor(() =>
            expect(server.deletes()).toEqual([
                '/user/mobile/sign-in-codes/code-1',
            ]),
        );
        expect(result.current.phase).toBe('hidden');

        act(() => result.current.show());
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-2'),
        );
        unmount();
        await waitFor(() =>
            expect(server.deletes()).toContain(
                '/user/mobile/sign-in-codes/code-2',
            ),
        );
    });
});
