import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    ParameterError,
} from '@lightdash/common';
import * as http from 'http';
import { getConfig } from '../config';
import GlobalState from '../globalState';
import {
    agentAccess,
    agentProjectUuid,
    connectedAgentAccess as connectedAccess,
} from './agentAccess.mock';
import { agentConnectHandler } from './agentConnect';
import { lightdashApi } from './dbt/apiClient';
import { openBrowser } from './login/oauth';

vi.mock('../config', () => ({ getConfig: vi.fn() }));
vi.mock('./dbt/apiClient', () => ({ lightdashApi: vi.fn() }));
vi.mock('./login/oauth', () => ({ openBrowser: vi.fn() }));

const spinner = vi.hoisted(() => ({
    text: '',
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
}));
vi.mock('ora', () => ({
    default: vi.fn((options: { text: string }) => {
        spinner.text = options.text;
        return spinner;
    }),
}));

const output = () =>
    vi.mocked(console.error).mock.calls.map(([line]) => String(line));
const connectedAgentAccess = {
    ...connectedAccess,
    expiresAt: new Date('2027-01-07T12:00:00Z'),
};
const connectedLine =
    'Connected. Agents now run as charlie@acme.com in an agent session until 7 Jan 2027.';
const expiredLine =
    'The link expired before you approved it. Run `lightdash agent connect` to get a new link.';
const mismatchLine =
    'You approved in the browser, but this Lightdash user is still not connected. Check the browser is signed in to Lightdash as the same user, then run `lightdash agent connect` again.';
const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
const setTTY = (value: boolean) =>
    Object.defineProperty(process.stderr, 'isTTY', {
        configurable: true,
        value,
    });

const originalExitCode = process.exitCode;
const getRedirect = (): string =>
    new URL(vi.mocked(openBrowser).mock.calls[0][0]).searchParams.get(
        'redirect',
    )!;

const approve = (redirect: string) =>
    new Promise<void>((resolve, reject) => {
        http.get(redirect, (response) => {
            response.resume();
            response.on('end', resolve);
        }).on('error', reject);
    });

const startWaitingForCallback = async (timeout?: number) => {
    let browserOpened: () => void;
    const opened = new Promise<void>((resolve) => {
        browserOpened = resolve;
    });
    vi.mocked(openBrowser).mockImplementation(async () => {
        browserOpened();
        return true;
    });
    const completion = agentConnectHandler({ verbose: false, timeout });
    await opened;
    return { completion, redirect: getRedirect() };
};

beforeEach(() => {
    process.exitCode = undefined;
    vi.stubEnv('LIGHTDASH_OAUTH_PORT', undefined);
    vi.stubEnv('CI', undefined);
    GlobalState.setNonInteractive(false);
    setTTY(false);
    spinner.start.mockReturnThis();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.mocked(getConfig).mockResolvedValue({
        context: { project: agentProjectUuid },
    });
    vi.mocked(lightdashApi).mockResolvedValue(agentAccess);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(http.Server.prototype, 'listen');
});

afterEach(() => {
    process.exitCode = originalExitCode;
    GlobalState.setNonInteractive(false);
    if (ttyDescriptor)
        Object.defineProperty(process.stderr, 'isTTY', ttyDescriptor);
    else Reflect.deleteProperty(process.stderr, 'isTTY');
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('agent connect', () => {
    it.each([
        '/generalSettings/projectManagement/project-uuid/agentIdentity',
        'https://settings.example/generalSettings/projectManagement/project-uuid/agentIdentity',
    ])('prints the admin settings URL for %s', async (settingsUrl) => {
        vi.mocked(getConfig).mockResolvedValue({
            context: {
                project: agentProjectUuid,
                serverUrl: 'https://lightdash.example',
            },
        });
        const message = 'Ask a project admin to add a shared agent account.';
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            refusal: {
                ...agentAccess.refusal!,
                reason: AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                action: AiAccessRefusalAction.ASK_ADMIN,
                message,
                connectUrl: null,
                settingsUrl,
            },
        });
        await agentConnectHandler({ verbose: false });
        expect(vi.mocked(console.error).mock.calls).toEqual([
            [message],
            [new URL(settingsUrl, 'https://lightdash.example').href],
        ]);
        expect(process.exitCode).toBe(1);
        expect(openBrowser).not.toHaveBeenCalled();
    });

    it('reconnects after an expired sign-in refusal', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            refusal: {
                ...agentAccess.refusal!,
                reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
                message:
                    'Your agent sign-in expired. Connect your agent again.',
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

    it.each(['organization', null] as const)(
        'returns without a server for a shared agent account with requirement source %s',
        async (requirementSource) => {
            vi.mocked(lightdashApi).mockResolvedValue({
                ...agentAccess,
                requirementSource,
                identity: 'ai_service_account',
                source: 'ai_service_account',
                enabled: true,
                refusal: null,
            });
            await agentConnectHandler({ verbose: false });
            expect(console.error).toHaveBeenCalledExactlyOnceWith(
                'Not needed: agents on this project use the shared agent account',
            );
            expect(process.exitCode).toBeUndefined();
            expect(http.Server.prototype.listen).not.toHaveBeenCalled();
            expect(openBrowser).not.toHaveBeenCalled();
        },
    );

    it('reports a refusal for a shared agent account', async () => {
        const message = 'Ask an admin to review the connection.';
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            identity: 'ai_service_account',
            source: 'ai_service_account',
            refusal: {
                ...agentAccess.refusal!,
                reason: AiAccessRefusalReason.PRINCIPAL_FAILED,
                action: AiAccessRefusalAction.ASK_ADMIN,
                message,
                connectUrl: null,
            },
        });
        await agentConnectHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(message);
        expect(process.exitCode).toBe(1);
        expect(http.Server.prototype.listen).not.toHaveBeenCalled();
        expect(openBrowser).not.toHaveBeenCalled();
    });

    it('returns without a server when connection is not required', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            ...agentAccess,
            requirementSource: null,
            refusal: null,
        });
        await agentConnectHandler({ verbose: false });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(
            'Agent sign-in is not required for this project',
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

    it.each([null, 'mcp_connect_link'])(
        'sets CLI attribution over %s and preserves the callback flow',
        async (entryPoint) => {
            const sourceUrl = new URL(agentAccess.refusal!.connectUrl!);
            if (entryPoint !== null)
                sourceUrl.searchParams.set('entryPoint', entryPoint);
            vi.mocked(lightdashApi).mockResolvedValue({
                ...agentAccess,
                refusal: {
                    ...agentAccess.refusal!,
                    connectUrl: sourceUrl.href,
                },
            });
            const { completion, redirect } = await startWaitingForCallback();
            const connectUrl = new URL(vi.mocked(openBrowser).mock.calls[0][0]);
            expect(connectUrl.origin).toBe('https://example.com');
            expect(connectUrl.pathname).toBe('/agent/connect');
            expect(connectUrl.searchParams.get('project')).toBe(
                agentProjectUuid,
            );
            expect(connectUrl.searchParams.getAll('entryPoint')).toEqual([
                'cli',
            ]);
            expect(connectUrl.searchParams.getAll('redirect')).toEqual([
                redirect,
            ]);
            expect(redirect).toMatch(/^http:\/\/localhost:\d+\/done$/);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(connectUrl.href),
            );
            expect((await fetch(`${redirect}/other`)).status).toBe(404);
            expect((await fetch(redirect, { method: 'POST' })).status).toBe(
                404,
            );
            vi.mocked(lightdashApi).mockResolvedValue(connectedAgentAccess);
            const response = await fetch(redirect);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/html');
            const html = await response.text();
            expect(html).toContain('Agent connected.');
            expect(html).toContain('You can close this tab.');
            await completion;
            expect(console.error).toHaveBeenCalledWith(connectedLine);
            expect(console.error).toHaveBeenLastCalledWith(
                'Run your last command again.',
            );
            expect(process.exitCode ?? 0).toBe(0);
            expect(lightdashApi).toHaveBeenCalledTimes(2);
            await expect(fetch(redirect)).rejects.toThrow();
        },
    );

    it.each([
        [
            'not_agent_session',
            'Your Snowflake sign-in is not an agent session. Ask your Snowflake admin to set IS_AGENTIC = TRUE on the security integration used for agents.',
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
                `Connection failed: ${message} Run \`lightdash agent connect\` to try again.`,
            );
            expect(process.exitCode).toBe(1);
            await expect(fetch(redirect)).rejects.toThrow();
        },
    );

    it('prints exact plain output for a non-TTY callback approval', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
        const { completion } = await startWaitingForCallback();
        vi.mocked(lightdashApi).mockResolvedValue({
            ...connectedAgentAccess,
            expiresAt: connectedAgentAccess.expiresAt.toISOString(),
        });
        await approve(getRedirect());
        await completion;
        expect(output()).toEqual([
            'Your agent needs to sign in to Snowflake as you, once.',
            `\n  Open: ${vi.mocked(openBrowser).mock.calls[0][0]}`,
            '  Opened in your browser.',
            '  Link expires in 3:00 (at 12:03).\n',
            'Waiting for you to approve in the browser…',
            connectedLine,
            'Run your last command again.',
        ]);
        expect(output().join('')).not.toMatch(/\r|\x1b\[/);
        expect(process.stderr.write).not.toHaveBeenCalled();
        expect(spinner.start).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('updates the TTY countdown and persists the connected line', async () => {
        vi.useFakeTimers();
        setTTY(true);
        vi.stubEnv('CI', 'false');
        const startSpinner = vi.spyOn(GlobalState, 'startSpinner');
        const { completion, redirect } = await startWaitingForCallback();
        await vi.advanceTimersByTimeAsync(0);
        expect(spinner.start).toHaveBeenCalledOnce();
        expect(startSpinner).toHaveBeenCalledWith(
            expect.objectContaining({
                isEnabled: true,
                stream: process.stderr,
            }),
        );
        expect(spinner.text).toBe(
            'Waiting for you to approve in the browser… (link expires in 3:00)',
        );
        await vi.advanceTimersByTimeAsync(1000);
        expect(spinner.text).toBe(
            'Waiting for you to approve in the browser… (link expires in 2:59)',
        );
        vi.mocked(lightdashApi).mockResolvedValue(connectedAgentAccess);
        await approve(redirect);
        await completion;
        expect(spinner.succeed).toHaveBeenCalledWith(connectedLine);
        expect(console.error).toHaveBeenLastCalledWith(
            'Run your last command again.',
        );
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['true', '1', 'non-interactive'])(
        'disables animation in a TTY for %s',
        async (mode) => {
            vi.useFakeTimers();
            setTTY(true);
            if (mode === 'non-interactive') GlobalState.setNonInteractive(true);
            else vi.stubEnv('CI', mode);
            const { completion } = await startWaitingForCallback(1);
            await vi.advanceTimersByTimeAsync(1000);
            await completion;
            expect(spinner.start).not.toHaveBeenCalled();
            expect(output()).toContain(
                'Waiting for you to approve in the browser…',
            );
            expect(output().join('')).not.toMatch(/\r|\x1b\[/);
        },
    );

    it('polls during the wait and succeeds without a callback', async () => {
        vi.useFakeTimers();
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(agentAccess)
            .mockResolvedValue(connectedAgentAccess);
        const { completion, redirect } = await startWaitingForCallback();
        await vi.advanceTimersByTimeAsync(2999);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await completion;
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(output()).toContain(connectedLine);
        expect(process.exitCode ?? 0).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        await expect(fetch(redirect)).rejects.toThrow();
    });

    it.each([false, true])(
        'expires at the deadline with TTY=%s',
        async (tty) => {
            vi.useFakeTimers();
            setTTY(tty);
            const { completion, redirect } = await startWaitingForCallback(4);
            await vi.advanceTimersByTimeAsync(4000);
            await completion;
            expect(console.error).toHaveBeenLastCalledWith(expiredLine);
            expect(process.exitCode).toBe(1);
            expect(lightdashApi).toHaveBeenCalledTimes(2);
            expect(vi.getTimerCount()).toBe(0);
            if (tty) expect(spinner.stop).toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(120_000);
            expect(lightdashApi).toHaveBeenCalledTimes(2);
            await expect(fetch(redirect)).rejects.toThrow();
        },
    );

    it('does not wait past the deadline for an in-flight poll', async () => {
        vi.useFakeTimers();
        let resolvePoll!: (value: typeof connectedAgentAccess) => void;
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(agentAccess)
            .mockImplementation(
                () =>
                    new Promise((resolve) => {
                        resolvePoll = resolve;
                    }),
            );
        const { completion } = await startWaitingForCallback(4);
        await vi.advanceTimersByTimeAsync(4000);
        await completion;
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(process.exitCode).toBe(1);
        expect(vi.mocked(lightdashApi).mock.calls[1][0].signal?.aborted).toBe(
            true,
        );
        expect(vi.getTimerCount()).toBe(0);
        resolvePoll(connectedAgentAccess);
        await vi.advanceTimersByTimeAsync(6000);
        expect(console.error).toHaveBeenLastCalledWith(expiredLine);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([null, 'marked_person', 'ai_service_account'] as const)(
        'keeps polling until expiry when refusal is null and identity is %s',
        async (identity) => {
            vi.useFakeTimers();
            vi.mocked(lightdashApi)
                .mockResolvedValueOnce(agentAccess)
                .mockResolvedValue({ ...connectedAgentAccess, identity });
            const { completion } = await startWaitingForCallback(7);
            await vi.advanceTimersByTimeAsync(7000);
            await completion;
            expect(lightdashApi).toHaveBeenCalledTimes(3);
            expect(output().join('')).not.toContain('Connected.');
            expect(console.error).toHaveBeenLastCalledWith(expiredLine);
            expect(process.exitCode).toBe(1);
            expect(vi.getTimerCount()).toBe(0);
        },
    );

    it.each([
        agentAccess,
        ...([null, 'marked_person', 'ai_service_account'] as const).map(
            (identity) => ({ ...connectedAgentAccess, identity }),
        ),
    ])(
        'rejects callback approval for disconnected access %j',
        async (access) => {
            vi.useFakeTimers();
            const { completion, redirect } = await startWaitingForCallback();
            vi.mocked(lightdashApi).mockResolvedValue(access);
            await approve(redirect);
            await completion;
            expect(lightdashApi).toHaveBeenCalledTimes(2);
            expect(output().join('')).not.toContain('Connected.');
            expect(console.error).toHaveBeenLastCalledWith(mismatchLine);
            expect(process.exitCode).toBe(1);
            expect(
                vi.mocked(lightdashApi).mock.calls[1][0].signal?.aborted,
            ).toBe(true);
            expect(vi.getTimerCount()).toBe(0);
        },
    );

    it('keeps polling after a callback access request error and succeeds', async () => {
        vi.useFakeTimers();
        const { completion, redirect } = await startWaitingForCallback(7);
        vi.mocked(lightdashApi)
            .mockRejectedValueOnce(new Error('API unavailable'))
            .mockResolvedValue(connectedAgentAccess);
        await approve(redirect);
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(output().join('')).not.toContain('Connected.');
        expect(vi.mocked(lightdashApi).mock.calls[1][0].signal?.aborted).toBe(
            false,
        );
        await vi.advanceTimersByTimeAsync(3000);
        await completion;
        expect(lightdashApi).toHaveBeenCalledTimes(3);
        expect(output()).toContain(connectedLine);
        expect(process.exitCode ?? 0).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('expires when callback verification and later polls fail', async () => {
        vi.useFakeTimers();
        const { completion, redirect } = await startWaitingForCallback(7);
        vi.mocked(lightdashApi).mockRejectedValue(new Error('API unavailable'));
        await approve(redirect);
        await vi.advanceTimersByTimeAsync(7000);
        await completion;
        expect(lightdashApi).toHaveBeenCalledTimes(4);
        expect(output().join('')).not.toContain('Connected.');
        expect(console.error).toHaveBeenLastCalledWith(expiredLine);
        expect(process.exitCode).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('expires when the callback access refresh stalls past the deadline', async () => {
        vi.useFakeTimers();
        const { completion, redirect } = await startWaitingForCallback(2);
        vi.mocked(lightdashApi).mockImplementation(() => new Promise(() => {}));
        await approve(redirect);
        await vi.advanceTimersByTimeAsync(2000);
        await completion;
        expect(output().join('')).not.toContain('Connected.');
        expect(console.error).toHaveBeenLastCalledWith(expiredLine);
        expect(process.exitCode).toBe(1);
        expect(vi.mocked(lightdashApi).mock.calls[1][0].signal?.aborted).toBe(
            true,
        );
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps polling after a request error', async () => {
        vi.useFakeTimers();
        const debug = vi.spyOn(GlobalState, 'debug');
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(agentAccess)
            .mockRejectedValueOnce(new Error('API unavailable'))
            .mockResolvedValue(connectedAgentAccess);
        const { completion } = await startWaitingForCallback(10);
        await vi.advanceTimersByTimeAsync(3000);
        expect(debug).toHaveBeenCalledWith(
            '> Could not poll agent access; retrying',
        );
        await vi.advanceTimersByTimeAsync(3000);
        await completion;
        expect(output()).toContain(connectedLine);
        expect(process.exitCode ?? 0).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['false', 'throws'])(
        'prints the manual link when opening the browser %s',
        async (mode) => {
            vi.useFakeTimers();
            if (mode === 'throws')
                vi.mocked(openBrowser).mockRejectedValue(
                    new Error('No browser'),
                );
            else vi.mocked(openBrowser).mockResolvedValue(false);
            const completion = agentConnectHandler({
                verbose: false,
                timeout: 0.02,
            });
            await vi.waitFor(() => expect(openBrowser).toHaveBeenCalled());
            await vi.advanceTimersByTimeAsync(20);
            await completion;
            expect(output()).toContain(
                `\n  Open: ${vi.mocked(openBrowser).mock.calls[0][0]}`,
            );
            expect(output()).toContain(
                '  Open this link in a browser to approve.',
            );
            expect(output()).not.toContain('  Opened in your browser.');
            expect(vi.getTimerCount()).toBe(0);
        },
    );

    it.each([
        [null, null, 'you in an agent session.'],
        ['charlie@acme.com', null, 'charlie@acme.com in an agent session.'],
        [
            null,
            connectedAgentAccess.expiresAt,
            'you in an agent session until 7 Jan 2027.',
        ],
    ])(
        'handles principal %s and expiry %s',
        async (principalName, expiresAt, ending) => {
            const { completion, redirect } = await startWaitingForCallback();
            vi.mocked(lightdashApi).mockResolvedValue({
                ...connectedAgentAccess,
                principalName,
                expiresAt,
            });
            await fetch(redirect);
            await completion;
            expect(output()).toContain(
                `Connected. Agents now run as ${ending}`,
            );
        },
    );

    it('stops the TTY spinner before reporting a callback error', async () => {
        setTTY(true);
        const { completion, redirect } = await startWaitingForCallback();
        await fetch(`${redirect}?error=license_required`);
        await completion;
        expect(console.error).toHaveBeenLastCalledWith(
            'Connection failed: An enterprise licence is required. Run `lightdash agent connect` to try again.',
        );
        expect(spinner.stop.mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(console.error).mock.invocationCallOrder.at(-1)!,
        );
        expect(process.exitCode).toBe(1);
    });

    it.each([false, true])(
        'shows waiting before expiry when the browser launcher stalls with TTY=%s',
        async (tty) => {
            vi.useFakeTimers();
            setTTY(tty);
            let launched!: () => void;
            const launch = new Promise<void>((resolve) => {
                launched = resolve;
            });
            vi.mocked(openBrowser).mockImplementation(() => {
                launched();
                return new Promise(() => {});
            });
            const completion = agentConnectHandler({
                verbose: false,
                timeout: 4,
            });
            await launch;
            await vi.advanceTimersByTimeAsync(1499);
            expect(output()).not.toContain(
                '  Open this link in a browser to approve.',
            );
            await vi.advanceTimersByTimeAsync(1);
            expect(output()).toContain(
                '  Open this link in a browser to approve.',
            );
            if (tty) {
                expect(spinner.text).toBe(
                    'Waiting for you to approve in the browser… (link expires in 0:03)',
                );
                await vi.advanceTimersByTimeAsync(1000);
                expect(spinner.text).toBe(
                    'Waiting for you to approve in the browser… (link expires in 0:02)',
                );
            } else {
                expect(output()).toContain(
                    'Waiting for you to approve in the browser…',
                );
                expect(output()).toContainEqual(
                    expect.stringContaining('  Link expires in 0:03'),
                );
                await vi.advanceTimersByTimeAsync(1000);
            }
            expect(output()).not.toContain(expiredLine);
            await vi.advanceTimersByTimeAsync(1500);
            await completion;
            expect(console.error).toHaveBeenLastCalledWith(expiredLine);
            expect(process.exitCode).toBe(1);
            expect(vi.getTimerCount()).toBe(0);
        },
    );

    it('bounds a stalled browser launch by a shorter connection deadline', async () => {
        vi.useFakeTimers();
        vi.mocked(openBrowser).mockImplementation(() => new Promise(() => {}));
        const completion = agentConnectHandler({ verbose: false, timeout: 1 });
        await vi.waitFor(() => expect(openBrowser).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(1000);
        await completion;
        expect(console.error).toHaveBeenLastCalledWith(expiredLine);
        expect(process.exitCode).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('handles a browser launch rejection after the wait has ended', async () => {
        vi.useFakeTimers();
        let rejectLaunch!: (error: Error) => void;
        vi.mocked(openBrowser).mockImplementation(
            () =>
                new Promise((_resolve, reject) => {
                    rejectLaunch = reject;
                }),
        );
        const completion = agentConnectHandler({ verbose: false, timeout: 2 });
        await vi.waitFor(() => expect(openBrowser).toHaveBeenCalled());
        await vi.advanceTimersByTimeAsync(2000);
        await completion;
        rejectLaunch(new Error('Browser launch failed'));
        await vi.advanceTimersByTimeAsync(0);
        expect(console.error).toHaveBeenLastCalledWith(expiredLine);
        expect(process.exitCode).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
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
