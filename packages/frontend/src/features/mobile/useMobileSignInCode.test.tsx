import {
    MobileSignInCodeStatus,
    MobileSignInRefusal,
    type ApiError,
    type MobileSignInDeclinedBy,
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
    clockSkewMs = 0,
}: {
    claimAfterPolls?: number;
    mintError?: ApiError;
    clockSkewMs?: number;
} = {}) => {
    const calls: Call[] = [];
    let mints = 0;
    let polls = 0;
    let approved = false;
    let declinedBy: MobileSignInDeclinedBy | null = null;
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
                const expiresAt = new Date(
                    Date.now() - clockSkewMs + TTL_MS,
                ).toISOString();
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
            if (method === 'POST' && url.endsWith('/decline')) {
                declinedBy = 'web';
                return {
                    status: MobileSignInCodeStatus.DECLINED,
                    matchNumber: null,
                };
            }
            if (method === 'DELETE') return undefined;
            const codeUuid = url.split('/').pop() ?? '';
            polls += 1;
            if (declinedBy) {
                return {
                    codeUuid,
                    status: MobileSignInCodeStatus.DECLINED,
                    expiresAt: new Date(START + CLAIM_MS).toISOString(),
                    matchNumber: null,
                    declinedBy,
                    device: { platform: 'ios', clientName: 'Lightdash iOS' },
                };
            }
            const isClaimed = polls > claimAfterPolls;
            if (!isClaimed) {
                return {
                    codeUuid,
                    status: MobileSignInCodeStatus.PENDING,
                    expiresAt: expiries.get(codeUuid),
                    matchNumber: null,
                    declinedBy: null,
                    device: null,
                };
            }
            const isWindowOver = Date.now() >= START + CLAIM_MS;
            const claimedStatus = approved
                ? MobileSignInCodeStatus.APPROVED
                : MobileSignInCodeStatus.CLAIMED;
            return {
                codeUuid,
                status: isWindowOver
                    ? MobileSignInCodeStatus.EXPIRED
                    : claimedStatus,
                expiresAt: new Date(START + CLAIM_MS).toISOString(),
                matchNumber: approved && !isWindowOver ? '47' : null,
                declinedBy: null,
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
        declines: () =>
            of('POST', (url) => url.endsWith('/decline')).map(
                (call) => call.body,
            ),
        cancelOnPhone: () => {
            declinedBy = 'phone';
        },
    };
};

const advance = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
};

let uninstallBridge: () => void;

beforeEach(() => {
    vi.useFakeTimers({
        now: START,
        shouldAdvanceTime: false,
        toFake: [
            'setTimeout',
            'clearTimeout',
            'setInterval',
            'clearInterval',
            'Date',
            'performance',
        ],
    });
    uninstallBridge = installFakeTimerBridge();
    setVisibility('visible');
    api.mockReset();
});

afterEach(() => {
    uninstallBridge();
    vi.useRealTimers();
});

describe('useMobileSignInCode with autoShow', () => {
    const renderAutoShown = (autoShow = true) =>
        renderHookWithProviders(
            (props: { autoShow: boolean }) => useMobileSignInCode(props),
            undefined,
            { initialProps: { autoShow } },
        );

    it('mints one code on mount and shows it', async () => {
        const server = mockServer();
        const { result } = renderAutoShown();
        await waitFor(() => expect(result.current.phase).toBe('showing'));
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 3);
        expect(server.mints()).toEqual([{ reason: 'show' }]);
        expect(server.deletes()).toEqual([]);
    });

    it('mints once under StrictMode and keeps the code', async () => {
        const server = mockServer();
        const { result, unmount } = renderHookWithProviders(
            () => useMobileSignInCode({ autoShow: true }),
            undefined,
            { reactStrictMode: true },
        );
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-1'),
        );
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 3);
        expect(server.mints()).toEqual([{ reason: 'show' }]);
        expect(server.deletes()).toEqual([]);
        expect(result.current.phase).toBe('showing');

        unmount();
        await waitFor(() =>
            expect(server.deletes()).toEqual([
                '/user/mobile/sign-in-codes/code-1',
            ]),
        );
    });

    it('waits for a hidden tab to become visible, then mints once', async () => {
        setVisibility('hidden');
        const server = mockServer();
        const { result } = renderAutoShown();
        await advance(TTL_MS);
        expect(server.mints()).toEqual([]);
        expect(result.current.phase).toBe('hidden');

        setVisibility('visible');
        await waitFor(() => expect(result.current.phase).toBe('showing'));
        setVisibility('hidden');
        setVisibility('visible');
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS);
        expect(server.mints()).toEqual([{ reason: 'show' }]);
    });

    it('keeps the code shown until it expires, then shows a new one', async () => {
        const server = mockServer();
        const { result } = renderAutoShown();
        await waitFor(() => expect(result.current.phase).toBe('showing'));

        await advance(TTL_MS - 5000);
        expect(result.current.phase).toBe('showing');
        expect(result.current.code?.codeUuid).toBe('code-1');
        expect(server.deletes()).toEqual([]);

        await advance(10_000);
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-2'),
        );
        expect(result.current.phase).toBe('showing');
        expect(server.mints()).toEqual([
            { reason: 'show' },
            { reason: 'auto_refresh' },
        ]);
    });

    it('does not mint again after the 15 minute idle stop', async () => {
        const server = mockServer();
        const { result } = renderAutoShown();
        await waitFor(() => expect(result.current.phase).toBe('showing'));

        for (let elapsed = 0; elapsed <= MOBILE_SIGN_IN_IDLE_LIMIT_MS; ) {
            // eslint-disable-next-line no-await-in-loop
            await advance(60_000);
            elapsed += 60_000;
        }
        await waitFor(() => expect(result.current.phase).toBe('hidden'));
        const mintsAtStop = server.mints().length;
        await advance(TTL_MS * 3);
        expect(server.mints()).toHaveLength(mintsAtStop);
        expect(result.current.phase).toBe('hidden');
    }, 60_000);

    it('mints nothing until autoShow turns on, and again each time it does', async () => {
        const server = mockServer();
        const { result, rerender } = renderAutoShown(false);
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 3);
        expect(server.mints()).toEqual([]);

        rerender({ autoShow: true });
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-1'),
        );
        act(() => result.current.hide());
        rerender({ autoShow: false });
        rerender({ autoShow: true });
        await waitFor(() =>
            expect(result.current.code?.codeUuid).toBe('code-2'),
        );
        expect(server.mints()).toHaveLength(2);
    });

    it('shows the refusal once and does not retry', async () => {
        const server = mockServer({
            mintError: {
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 429,
                    message: 'Too many codes',
                    data: { reason: MobileSignInRefusal.RATE_LIMITED },
                },
            },
        });
        const { result } = renderAutoShown();
        await waitFor(() => expect(result.current.phase).toBe('refused'));
        await advance(TTL_MS * 2);
        expect(result.current.refusal).toBe(MobileSignInRefusal.RATE_LIMITED);
        expect(result.current.code).toBeNull();
        expect(server.mints()).toHaveLength(1);
    });

    it('reports a failed mint once so the user can retry', async () => {
        const server = mockServer({
            mintError: {
                status: 'error',
                error: {
                    name: 'UnexpectedServerError',
                    statusCode: 500,
                    message: 'boom',
                    data: {},
                },
            },
        });
        const { result } = renderAutoShown();
        await waitFor(() => expect(result.current.phase).toBe('failed'));
        await advance(TTL_MS * 2);
        expect(server.mints()).toHaveLength(1);
    });
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

    it('leaves the number state within one poll when the phone cancels', async () => {
        const server = mockServer({ claimAfterPolls: 1 });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 2);
        await waitFor(() => expect(result.current.phase).toBe('claimed'));
        act(() => result.current.approve());
        await waitFor(() => expect(result.current.phase).toBe('approved'));
        expect(result.current.state?.matchNumber).toBe('47');

        server.cancelOnPhone();
        const pollsBefore = server.polls();
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS);
        expect(server.polls()).toBe(pollsBefore + 1);
        expect(result.current.phase).toBe('declined');
        expect(result.current.state).toMatchObject({
            declinedBy: 'phone',
            matchNumber: null,
        });

        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 3);
        expect(server.polls()).toBe(pollsBefore + 1);
    });

    it('declines on the server when the user cancels after the confirm', async () => {
        const server = mockServer({ claimAfterPolls: 1 });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 2);
        await waitFor(() => expect(result.current.phase).toBe('claimed'));
        act(() => result.current.approve());
        await waitFor(() => expect(result.current.phase).toBe('approved'));

        act(() => result.current.decline());
        await waitFor(() => expect(result.current.phase).toBe('declined'));
        expect(server.declines()).toEqual([{ nonce: 'nonce-1' }]);
        expect(result.current.state?.declinedBy).toBe('web');
        expect(server.deletes()).toEqual([]);
    });

    it('keeps the number until the claim window ends, then shows the code as expired', async () => {
        const server = mockServer({ claimAfterPolls: 1 });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 2);
        await waitFor(() => expect(result.current.phase).toBe('claimed'));
        act(() => result.current.approve());
        await waitFor(() => expect(result.current.phase).toBe('approved'));

        await advance(CLAIM_MS - Date.now() + START - 5_000);
        expect(result.current.phase).toBe('approved');
        expect(result.current.state?.matchNumber).toBe('47');

        await advance(10_000);
        expect(result.current.phase).toBe('expired');
        expect(result.current.state?.matchNumber).toBeNull();
        expect(server.mints()).toHaveLength(1);
    });

    it('stops refreshing once a phone claims the code and approves with the nonce', async () => {
        const server = mockServer({ claimAfterPolls: 1 });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await advance(MOBILE_SIGN_IN_POLL_INTERVAL_MS * 2);
        await waitFor(() => expect(result.current.phase).toBe('claimed'));
        expect(result.current.state?.matchNumber).toBeNull();

        await advance(TTL_MS + 1000);
        expect(result.current.phase).toBe('claimed');
        expect(server.mints()).toHaveLength(1);

        act(() => result.current.approve());
        await waitFor(() => expect(result.current.phase).toBe('approved'));
        expect(server.approvals()).toEqual([{ nonce: 'nonce-1' }]);
        expect(result.current.state?.matchNumber).toBe('47');
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

    it('cancels the code when step 2 closes and when the page closes', async () => {
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

    it('trusts the server lifetime, not the browser clock', async () => {
        const server = mockServer({ clockSkewMs: 30 * 60 * 1000 });
        const { result } = renderHookWithProviders(() => useMobileSignInCode());
        act(() => result.current.show());
        await waitFor(() => expect(result.current.phase).toBe('showing'));

        await advance(TTL_MS - 5000);
        expect(server.mints()).toHaveLength(1);

        await advance(10_000);
        await waitFor(() => expect(server.mints()).toHaveLength(2));
        await advance(TTL_MS - 5000);
        expect(server.mints()).toHaveLength(2);
    });
});
