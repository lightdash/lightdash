import {
    generateOAuthErrorResponse,
    generateOAuthSuccessResponse,
    ParameterError,
} from '@lightdash/common';
import * as http from 'http';
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

const pollForConnection = async (projectUuid: string): Promise<boolean> => {
    const deadline = Date.now() + 120_000;
    const poll = async (): Promise<boolean> => {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, Math.min(3000, deadline - Date.now()));
        });
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const access = await Promise.race([
                getAgentAccess(projectUuid),
                new Promise<undefined>((resolve) => {
                    timer = setTimeout(() => resolve(undefined), remaining);
                }),
            ]);
            if (access === undefined) return false;
            if (access.refusal === null) return true;
        } finally {
            clearTimeout(timer);
        }
        return poll();
    };
    return poll();
};

export const agentConnectHandler = async (
    options: AgentConnectOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const projectUuid = await resolveAgentProject(options.project);
    const access = await getAgentAccess(projectUuid);
    if (access.refusal === null && access.identity === 'connected_person') {
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

    let resolveCallback: () => void;
    let rejectCallback: (error: Error) => void;
    const callback = new Promise<void>((resolve, reject) => {
        resolveCallback = resolve;
        rejectCallback = reject;
    }).then(
        () => ({ status: 'connected' as const }),
        (error: Error) => ({ status: 'failed' as const, code: error.message }),
    );
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
    let timer: ReturnType<typeof setTimeout> | undefined;
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
        const result = Promise.race([
            callback,
            new Promise<{ status: 'timeout' }>((resolve) => {
                timer = setTimeout(
                    () => resolve({ status: 'timeout' }),
                    timeout * 1000,
                );
            }),
        ]);
        console.error(`\n${styles.title('🔐 Agent connection')}`);
        console.error('Opening browser for authentication...');
        console.error(
            "If the browser doesn't open automatically, please visit:",
        );
        console.error(`${styles.secondary(connectUrl.href)}\n`);
        await openBrowser(connectUrl.href);
        const outcome = await result;
        if (outcome.status === 'failed') {
            console.error(
                `Agent connection failed: ${getFailureReason(outcome.code)}`,
            );
            process.exitCode = 1;
            return;
        }
        if (
            outcome.status === 'connected' ||
            (await pollForConnection(projectUuid))
        ) {
            console.error('Agent connected');
            return;
        }
        console.error(
            'Agent connection did not complete. Run `lightdash agent status` after you approve in the browser.',
        );
        process.exitCode = 1;
    } finally {
        clearTimeout(timer);
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
        });
    }
};
