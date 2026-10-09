import {
    AgentIdentityConnectEntryPoint,
    generateOAuthErrorResponse,
    generateOAuthSuccessResponse,
    ParameterError,
    type AiAccessForUser,
} from '@lightdash/common';
import * as http from 'http';
import type { Ora } from 'ora';
import GlobalState from '../globalState';
import * as styles from '../styles';
import {
    getAgentAccess,
    resolveAgentProject,
    type AgentOptions,
} from './agentAccess';
import { openBrowser } from './login/oauth';

type AgentConnectOptions = AgentOptions & {
    oauthPort?: number;
    timeout?: number;
};

const getFailureReason = (error: string): string => {
    switch (error) {
        case 'not_agent_session':
            return 'Your Snowflake sign-in is not an agent session. Ask your Snowflake admin to set IS_AGENTIC = TRUE on the security integration used for AI.';
        case 'no_refresh_token':
            return 'Snowflake did not return a refresh token. Try again.';
        case 'license_required':
            return 'An enterprise licence is required.';
        default:
            return 'The sign-in did not complete. Try again.';
    }
};

const formatRemaining = (milliseconds: number): string => {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

type ConnectOutcome =
    | { status: 'connected'; access: AiAccessForUser }
    | { status: 'failed'; code: string }
    | { status: 'user_not_connected' }
    | { status: 'timeout' };

const isConnected = (access: AiAccessForUser): boolean =>
    access.refusal === null && access.identity === 'connected_person';

export const agentConnectHandler = async (
    options: AgentConnectOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const projectUuid = await resolveAgentProject(options.project);
    const access = await getAgentAccess(projectUuid);
    if (isConnected(access)) {
        console.error('Agent already connected');
        return;
    }
    if (access.requirementSource === null) {
        console.error('Agent connection is not required for this project');
        return;
    }
    if (access.refusal?.action !== 'sign_in' || !access.refusal.connectUrl) {
        console.error(access.refusal?.message ?? 'Agent not connected');
        process.exitCode = 1;
        return;
    }

    const timeout = options.timeout ?? 180;
    if (
        !Number.isFinite(timeout) ||
        timeout <= 0 ||
        timeout * 1000 > 2_147_483_647
    ) {
        throw new ParameterError(
            'Timeout must be a positive number of seconds no greater than 2147483.647',
        );
    }
    const port =
        options.oauthPort ??
        (process.env.LIGHTDASH_OAUTH_PORT
            ? Number(process.env.LIGHTDASH_OAUTH_PORT)
            : 0);
    if (
        !Number.isInteger(port) ||
        port < 0 ||
        port > 65535 ||
        (port === 0 &&
            (options.oauthPort !== undefined ||
                process.env.LIGHTDASH_OAUTH_PORT))
    ) {
        throw new ParameterError(
            'OAuth port must be a number between 1 and 65535',
        );
    }

    const requests = new AbortController();
    let stopped = false;
    let resolveCallback: () => void;
    let rejectCallback: (error: Error) => void;
    const callback = new Promise<void>((resolve, reject) => {
        resolveCallback = resolve;
        rejectCallback = reject;
    });
    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (req.method !== 'GET' || url.pathname !== '/done') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
        const error = url.searchParams.get('error');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (error !== null) {
            res.writeHead(400);
            res.end(
                generateOAuthErrorResponse('Agent connection failed', [
                    getFailureReason(error),
                ]),
            );
            rejectCallback(new Error(error));
        } else {
            res.writeHead(200);
            res.end(
                generateOAuthSuccessResponse('Agent connected.', [
                    'You can close this tab.',
                ]),
            );
            resolveCallback();
        }
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let browserTimer: ReturnType<typeof setTimeout> | null = null;
    let spinner: Ora | null = null;
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, 'localhost', resolve);
        });
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new ParameterError(
                'Could not start the agent callback server',
            );
        }
        const redirect = `http://localhost:${address.port}/done`;
        GlobalState.debug(`> Agent callback server listening on ${redirect}`);
        const connectUrl = new URL(access.refusal.connectUrl);
        connectUrl.searchParams.set('redirect', redirect);
        connectUrl.searchParams.set(
            'entryPoint',
            AgentIdentityConnectEntryPoint.CLI,
        );
        const interactive =
            process.stderr.isTTY === true &&
            !GlobalState.isNonInteractive() &&
            (!process.env.CI || process.env.CI === 'false');
        const deadline = Date.now() + timeout * 1000;
        const expiry = new Promise<ConnectOutcome>((resolve) => {
            timer = setTimeout(
                () => resolve({ status: 'timeout' }),
                timeout * 1000,
            );
        });
        const result = Promise.race([
            callback.then(
                async (): Promise<ConnectOutcome> => {
                    try {
                        const currentAccess = await getAgentAccess(
                            projectUuid,
                            requests.signal,
                        );
                        return isConnected(currentAccess)
                            ? { status: 'connected', access: currentAccess }
                            : { status: 'user_not_connected' };
                    } catch {
                        if (!stopped)
                            GlobalState.debug(
                                '> Could not refresh agent access after approval',
                            );
                        return expiry;
                    }
                },
                (error: Error): ConnectOutcome => ({
                    status: 'failed',
                    code: error.message,
                }),
            ),
            expiry,
            new Promise<ConnectOutcome>((resolve) => {
                let polling = false;
                pollTimer = setInterval(async () => {
                    if (polling || stopped || Date.now() >= deadline) return;
                    polling = true;
                    try {
                        const currentAccess = await getAgentAccess(
                            projectUuid,
                            requests.signal,
                        );
                        if (!stopped && isConnected(currentAccess)) {
                            resolve({
                                status: 'connected',
                                access: currentAccess,
                            });
                        }
                    } catch {
                        if (!stopped)
                            GlobalState.debug(
                                '> Could not poll agent access; retrying',
                            );
                    } finally {
                        polling = false;
                    }
                }, 3000);
            }),
        ]);
        console.error('Your agent needs to sign in to Snowflake as you, once.');
        console.error(`\n  Open: ${connectUrl.href}`);
        const opened = await Promise.race([
            openBrowser(connectUrl.href).catch(() => false),
            new Promise<boolean>((resolve) => {
                browserTimer = setTimeout(() => resolve(false), 1500);
            }),
            result.then(() => false),
        ]);
        if (browserTimer) clearTimeout(browserTimer);
        console.error(
            opened
                ? '  Opened in your browser.'
                : '  Open this link in a browser to approve.',
        );
        const waiting = 'Waiting for you to approve in the browser…';
        if (interactive) {
            console.error('');
            const waitingText = () =>
                `${waiting} (link expires in ${formatRemaining(deadline - Date.now())})`;
            spinner = GlobalState.startSpinner({
                text: waitingText(),
                stream: process.stderr,
                isEnabled: true,
            });
            countdownTimer = setInterval(() => {
                if (spinner) spinner.text = waitingText();
            }, 1000);
        } else {
            const expiresAt = new Date(deadline).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
            });
            console.error(
                `  Link expires in ${formatRemaining(deadline - Date.now())} (at ${expiresAt}).\n`,
            );
            console.error(waiting);
        }
        const outcome = await result;
        if (outcome.status === 'connected') {
            const connectedAccess = outcome.access;
            const principal = connectedAccess.principalName ?? 'you';
            const until = connectedAccess.expiresAt
                ? ` until ${new Date(
                      connectedAccess.expiresAt,
                  ).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                  })}`
                : '';
            const connected = `${interactive ? styles.success('Connected.') : 'Connected.'} Agents now run as ${interactive ? styles.bold(principal) : principal} in an agent session${until}.`;
            if (spinner) spinner.succeed(connected);
            else console.error(connected);
            console.error('Run your last command again.');
            return;
        }
        spinner?.stop();
        if (outcome.status === 'user_not_connected') {
            console.error(
                'You approved in the browser, but this Lightdash user is still not connected. Check the browser is signed in to Lightdash as the same user, then run `lightdash agent connect` again.',
            );
        } else {
            console.error(
                outcome.status === 'failed'
                    ? `Connection failed: ${getFailureReason(outcome.code)} Run \`lightdash agent connect\` to try again.`
                    : 'The link expired before you approved it. Run `lightdash agent connect` to get a new link.',
            );
        }
        process.exitCode = 1;
    } finally {
        stopped = true;
        requests.abort();
        if (timer) clearTimeout(timer);
        if (pollTimer) clearInterval(pollTimer);
        if (countdownTimer) clearInterval(countdownTimer);
        if (browserTimer) clearTimeout(browserTimer);
        spinner?.stop();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
        });
    }
};
