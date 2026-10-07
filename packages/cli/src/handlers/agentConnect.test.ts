import { AiAccessRefusalReason, ParameterError } from '@lightdash/common';
import * as http from 'http';
import { getConfig } from '../config';
import {
    agentAccess,
    agentProjectUuid,
    connectedAgentAccess,
} from './agentAccess.mock';
import { agentConnectHandler } from './agentConnect';
import { lightdashApi } from './dbt/apiClient';
import { openBrowser } from './login/oauth';

vi.mock('../config', () => ({ getConfig: vi.fn() }));
vi.mock('./dbt/apiClient', () => ({ lightdashApi: vi.fn() }));
vi.mock('./login/oauth', () => ({ openBrowser: vi.fn() }));

const originalExitCode = process.exitCode;
const getRedirect = (): string =>
    new URL(vi.mocked(openBrowser).mock.calls[0][0]).searchParams.get(
        'redirect',
    )!;

const startWaitingForCallback = async (timeout?: number) => {
    let browserOpened: () => void;
    const opened = new Promise<void>((resolve) => {
        browserOpened = resolve;
    });
    vi.mocked(openBrowser).mockImplementation(async () => {
        browserOpened();
    });
    const completion = agentConnectHandler({ verbose: false, timeout });
    await opened;
    return { completion, redirect: getRedirect() };
};

beforeEach(() => {
    process.exitCode = undefined;
    vi.stubEnv('LIGHTDASH_OAUTH_PORT', undefined);
    vi.mocked(getConfig).mockResolvedValue({
        context: { project: agentProjectUuid },
    });
    vi.mocked(lightdashApi).mockResolvedValue(agentAccess);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(http.Server.prototype, 'listen');
});

afterEach(() => {
    process.exitCode = originalExitCode;
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('agent connect', () => {
    it('reconnects after an expired sign-in refusal', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            refusal: {
                ...agentAccess.refusal!,
                reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
                message: 'Your agent connection expired. Connect again.',
            },
        });
        const { completion, redirect } = await startWaitingForCallback();
        vi.mocked(lightdashApi).mockResolvedValue(connectedAgentAccess);
        await fetch(redirect);
        await completion;
        expect(openBrowser).toHaveBeenCalledOnce();
        expect(process.exitCode ?? 0).toBe(0);
    });
    it('returns without a server when already connected', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(connectedAgentAccess);
        await agentConnectHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(
            'Agent already connected',
        );
        expect(http.Server.prototype.listen).not.toHaveBeenCalled();
        expect(openBrowser).not.toHaveBeenCalled();
        expect(process.exitCode ?? 0).toBe(0);
    });

    it('returns without a server when connection is not required', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            requirementSource: null,
            refusal: null,
        });
        await agentConnectHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(
            'Agent connection is not required for this project',
        );
        expect(http.Server.prototype.listen).not.toHaveBeenCalled();
        expect(process.exitCode ?? 0).toBe(0);
    });

    it.each([
        { ...agentAccess.refusal!, action: null },
        { ...agentAccess.refusal!, connectUrl: null },
    ])('reports a refusal that cannot open sign-in', async (refusal) => {
        vi.mocked(lightdashApi).mockResolvedValue({ ...agentAccess, refusal });
        await agentConnectHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(refusal.message);
        expect(openBrowser).not.toHaveBeenCalled();
        expect(http.Server.prototype.listen).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
    });

    it('opens the connect URL and accepts only GET /done, then closes the server', async () => {
        const { completion, redirect } = await startWaitingForCallback();
        const connectUrl = new URL(vi.mocked(openBrowser).mock.calls[0][0]);
        expect(connectUrl.origin).toBe('https://example.com');
        expect(connectUrl.pathname).toBe('/agent/connect');
        expect(connectUrl.searchParams.get('project')).toBe(agentProjectUuid);
        expect(connectUrl.searchParams.getAll('redirect')).toEqual([redirect]);
        expect(redirect).toMatch(/^http:\/\/localhost:\d+\/done$/);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining(connectUrl.href),
        );
        expect((await fetch(`${redirect}/other`)).status).toBe(404);
        expect((await fetch(redirect, { method: 'POST' })).status).toBe(404);
        const response = await fetch(redirect);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
        const html = await response.text();
        expect(html).toContain('Agent connected.');
        expect(html).toContain('You can close this tab.');
        await completion;
        expect(console.error).toHaveBeenLastCalledWith('Agent connected');
        expect(process.exitCode ?? 0).toBe(0);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        await expect(fetch(redirect)).rejects.toThrow();
    });

    it.each([
        [
            'not_agent_session',
            'Your Snowflake sign-in is not an agent session. Ask your Snowflake admin to set IS_AGENTIC = TRUE on the security integration used for AI.',
        ],
        [
            'no_refresh_token',
            'Snowflake did not return a refresh token. Try again.',
        ],
        ['license_required', 'An enterprise licence is required.'],
        ['sign_in_failed', 'The sign-in did not complete. Try again.'],
        [
            '<script>alert(1)</script>',
            'The sign-in did not complete. Try again.',
        ],
    ])(
        'reports the callback failure %s and closes the server',
        async (code, message) => {
            const { completion, redirect } = await startWaitingForCallback();
            const response = await fetch(
                `${redirect}?error=${encodeURIComponent(code)}`,
            );
            expect(response.status).toBe(400);
            expect((await response.text()).replaceAll('&#x3D;', '=')).toContain(
                message,
            );
            await completion;
            expect(console.error).toHaveBeenLastCalledWith(
                `Agent connection failed: ${message}`,
            );
            expect(process.exitCode).toBe(1);
            await expect(fetch(redirect)).rejects.toThrow();
        },
    );

    it('polls after the callback timeout and succeeds on the second me call', async () => {
        vi.useFakeTimers();
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(agentAccess)
            .mockResolvedValue(connectedAgentAccess);
        const { completion, redirect } = await startWaitingForCallback(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(3000);
        await completion;
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(console.error).toHaveBeenLastCalledWith('Agent connected');
        expect(process.exitCode ?? 0).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        await expect(fetch(redirect)).rejects.toThrow();
    });

    it('stops polling after another 120 seconds', async () => {
        vi.useFakeTimers();
        const { completion } = await startWaitingForCallback();
        await vi.advanceTimersByTimeAsync(180_000);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(120_000);
        await completion;
        expect(console.error).toHaveBeenLastCalledWith(
            'Agent connection did not complete. Run `lightdash agent status` after you approve in the browser.',
        );
        expect(process.exitCode).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
        const calls = vi.mocked(lightdashApi).mock.calls.length;
        await vi.advanceTimersByTimeAsync(6000);
        expect(lightdashApi).toHaveBeenCalledTimes(calls);
    });

    it('bounds the polling wait even when the API stops responding', async () => {
        vi.useFakeTimers();
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(agentAccess)
            .mockImplementation(() => new Promise(() => {}));
        const { completion } = await startWaitingForCallback(1);
        await vi.advanceTimersByTimeAsync(121_000);
        await completion;
        expect(process.exitCode).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('closes the server when polling fails', async () => {
        vi.useFakeTimers();
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(agentAccess)
            .mockRejectedValue(new Error('API unavailable'));
        const { completion, redirect } = await startWaitingForCallback(1);
        const rejected = completion.catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(4000);
        expect(await rejected).toEqual(new Error('API unavailable'));
        expect(vi.getTimerCount()).toBe(0);
        await expect(fetch(redirect)).rejects.toThrow();
    });

    it.each(['flag', 'environment', 'override'] as const)(
        'uses the %s port and propagates listen errors without opening a browser',
        async (source) => {
            const occupied = http.createServer();
            await new Promise<void>((resolve) => {
                occupied.listen(0, 'localhost', resolve);
            });
            try {
                const address = occupied.address();
                if (!address || typeof address === 'string')
                    throw new Error('Missing port');
                if (source === 'environment')
                    vi.stubEnv('LIGHTDASH_OAUTH_PORT', String(address.port));
                if (source === 'override')
                    vi.stubEnv('LIGHTDASH_OAUTH_PORT', 'invalid');
                await expect(
                    agentConnectHandler({
                        verbose: false,
                        oauthPort:
                            source === 'environment' ? undefined : address.port,
                    }),
                ).rejects.toMatchObject({ code: 'EADDRINUSE' });
                expect(openBrowser).not.toHaveBeenCalled();
            } finally {
                await new Promise<void>((resolve) => {
                    occupied.close(() => resolve());
                });
            }
        },
    );

    it('rejects an invalid configured port before starting a server', async () => {
        vi.stubEnv('LIGHTDASH_OAUTH_PORT', 'invalid');
        await expect(agentConnectHandler({ verbose: false })).rejects.toThrow(
            ParameterError,
        );
        expect(http.Server.prototype.listen).not.toHaveBeenCalled();
    });

    it.each([0, -1, NaN, Infinity, 2_147_484])(
        'rejects invalid timeout %s',
        async (timeout) => {
            await expect(
                agentConnectHandler({ verbose: false, timeout }),
            ).rejects.toThrow(ParameterError);
            expect(http.Server.prototype.listen).not.toHaveBeenCalled();
        },
    );

    it('requires a configured project', async () => {
        vi.mocked(getConfig).mockResolvedValue({});
        await expect(agentConnectHandler({ verbose: false })).rejects.toThrow(
            'lightdash config set-project',
        );
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    it('uses an explicit project UUID instead of the configured project', async () => {
        const project = '00000000-0000-0000-0000-000000000002';
        vi.mocked(lightdashApi).mockResolvedValue(connectedAgentAccess);
        await agentConnectHandler({ project, verbose: false });
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: `/api/v2/projects/${project}/ai-access/me`,
            body: undefined,
        });
    });
});
