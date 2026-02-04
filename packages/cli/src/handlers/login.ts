import { AuthorizationError } from '@lightdash/common';
import inquirer from 'inquirer';
import fetch from 'node-fetch';
import { URL } from 'url';
import { LightdashAnalytics } from '../analytics/analytics';
import {
    configFilePath,
    getConfig,
    setContext,
    setDefaultUser,
} from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion } from './dbt/apiClient';
import { loginWithOauth } from './oauthLogin';
import { setFirstProject, setProjectCommand } from './setProject';
import { buildRequestHeaders } from './utils';

type LoginOptions = {
    /** Associated with a Personal Access Token or Service Account Token */
    token?: string;
    /** Email for password-based login (local development only) */
    email?: string;
    /** Password for password-based login (local development only) */
    password?: string;
    /** Project UUID to select after login */
    project?: string;
    interactive?: boolean;
    verbose: boolean;
};

/**
 * Normalizes a URL input to make it more user-friendly:
 * - Single words (e.g., "app") become subdomains of lightdash.cloud (e.g., "https://app.lightdash.cloud")
 * - Missing protocol defaults to https://
 * - Any path is stripped (e.g., "https://app.lightdash.cloud/projects/123" -> "https://app.lightdash.cloud")
 * - Preserves explicitly provided protocols (http:// or https://)
 *
 * @param input - The URL input from the user
 * @returns Normalized URL with protocol and host only
 *
 * @example
 * normalizeUrl("app") // "https://app.lightdash.cloud"
 * normalizeUrl("app.lightdash.cloud") // "https://app.lightdash.cloud"
 * normalizeUrl("https://app.lightdash.cloud/projects/123") // "https://app.lightdash.cloud"
 * normalizeUrl("http://localhost:3000") // "http://localhost:3000"
 * normalizeUrl("custom.domain.com") // "https://custom.domain.com"
 */
const normalizeUrl = (input: string): string => {
    let url = input.trim();

    // If it's a single word (no dots, slashes, or colons), assume it's a lightdash.cloud subdomain
    if (!url.includes('/') && !url.includes('.') && !url.includes(':')) {
        url = `${url}.lightdash.cloud`;
    }

    // If no protocol is specified, add https://
    if (!url.match(/^https?:\/\//)) {
        url = `https://${url}`;
    }

    // Parse the URL to extract protocol, hostname, and port (strips path)
    const parsedUrl = new URL(url);

    // Return only protocol + host (host includes hostname and port)
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
};

// Helper function to determine login method
const getLoginMethod = (options: LoginOptions): string => {
    if (options.token) return 'token';
    if (options.email) return 'password';
    return 'oauth';
};

const loginWithToken = async (url: string, token: string) => {
    const userInfoUrl = new URL(`/api/v1/user`, url).href;
    const response = await fetch(userInfoUrl, {
        method: 'GET',
        headers: buildRequestHeaders(token),
    });

    if (response.status !== 200) {
        throw new AuthorizationError(
            `Cannot sign in with token:\n${JSON.stringify(
                await response.json(),
            )}`,
        );
    }
    const userBody = await response.json();

    const { userUuid, organizationUuid } = userBody.results || userBody;
    return {
        userUuid,
        organizationUuid,
        token,
    };
};

const loginWithEmailPassword = async (
    url: string,
    email: string,
    password: string,
) => {
    // Step 1: Login with email/password to get session
    const loginUrl = new URL('/api/v1/login', url).href;
    const loginResponse = await fetch(loginUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });

    if (loginResponse.status !== 200) {
        const errorBody = await loginResponse.json().catch(() => ({}));
        throw new AuthorizationError(
            `Cannot sign in with email/password: ${
                (errorBody as { error?: { message?: string } }).error
                    ?.message || 'Invalid credentials'
            }`,
        );
    }

    // Extract session cookie from response
    const cookies = loginResponse.headers.get('set-cookie');
    if (!cookies) {
        throw new AuthorizationError(
            'Login succeeded but no session cookie received',
        );
    }

    // Step 2: Create a Personal Access Token using the session
    const patUrl = new URL('/api/v1/user/me/personal-access-tokens', url).href;
    const patResponse = await fetch(patUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookies,
        },
        body: JSON.stringify({
            description: 'Lightdash CLI',
            expiresAt: new Date(
                Date.now() + 365 * 24 * 60 * 60 * 1000,
            ).toISOString(), // 1 year
            autoGenerated: false,
        }),
    });

    if (patResponse.status !== 200) {
        const errorBody = await patResponse.json().catch(() => ({}));
        throw new AuthorizationError(
            `Failed to create personal access token: ${
                (errorBody as { error?: { message?: string } }).error
                    ?.message || 'Unknown error'
            }`,
        );
    }

    const patBody = (await patResponse.json()) as {
        results: { token: string };
    };
    const { token } = patBody.results;

    // Step 3: Get user info using the new token
    const userInfoUrl = new URL('/api/v1/user', url).href;
    const userResponse = await fetch(userInfoUrl, {
        method: 'GET',
        headers: buildRequestHeaders(token),
    });

    if (userResponse.status !== 200) {
        throw new AuthorizationError('Failed to get user info after login');
    }

    const userBody = (await userResponse.json()) as {
        results: { userUuid: string; organizationUuid: string };
    };
    const { userUuid, organizationUuid } = userBody.results;

    return {
        userUuid,
        organizationUuid,
        token,
    };
};

export const login = async (
    urlInput: string | undefined,
    options: LoginOptions,
) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    // If no URL provided, try to use the saved URL from config
    let resolvedUrlInput = urlInput;
    if (!resolvedUrlInput) {
        const config = await getConfig();
        if (config.context?.serverUrl) {
            resolvedUrlInput = config.context.serverUrl;
            console.error(
                `${styles.secondary(`Using saved URL: ${resolvedUrlInput}`)}`,
            );
        } else {
            throw new AuthorizationError(
                `No URL provided and no saved URL found. Please provide a URL:\n\n  ${styles.bold(
                    '⚡️ lightdash login <url>',
                )}\n\nExamples:\n  ${styles.bold(
                    '⚡️ lightdash login app',
                )} ${styles.secondary(
                    '(for https://app.lightdash.cloud)',
                )}\n  ${styles.bold(
                    '⚡️ lightdash login https://custom.domain.com',
                )}`,
            );
        }
    }

    // Normalize the URL input to handle various formats
    const url = normalizeUrl(resolvedUrlInput);

    if (urlInput) {
        GlobalState.debug(`> Original URL input: ${urlInput}`);
    }
    GlobalState.debug(`> Normalized URL: ${url}`);

    const loginMethod = getLoginMethod(options);

    await LightdashAnalytics.track({
        event: 'login.started',
        properties: {
            url,
            method: loginMethod,
        },
    });

    if (url.includes('lightdash.com')) {
        const cloudServer = url.replace('lightdash.com', 'lightdash.cloud');
        console.error(
            `\n${styles.title('Warning')}: Login URL ${styles.secondary(
                url,
            )} does not match a valid cloud server, perhaps you meant ${styles.secondary(
                cloudServer,
            )} ?\n`,
        );
    }

    // Support environment variables for credentials (workaround for shell escaping issues)
    const email = options.email || process.env.LIGHTDASH_CLI_EMAIL;
    const password = options.password || process.env.LIGHTDASH_CLI_PASSWORD;

    let loginResult;
    if (options.token) {
        loginResult = await loginWithToken(url, options.token);
    } else if (email) {
        // Warn that email/password login should only be used for local development
        console.error(
            `\n${styles.warning(
                '⚠️  Warning:',
            )} Email/password login should only be used for local development.\n` +
                `   Credentials may be visible in shell history. For production, use:\n` +
                `   ${styles.bold('⚡️ lightdash login <url>')} (OAuth)\n` +
                `   ${styles.bold('⚡️ lightdash login <url> --token <pat>')} (Personal Access Token)\n`,
        );

        let finalPassword = password;
        if (!finalPassword) {
            if (GlobalState.isNonInteractive()) {
                throw new AuthorizationError(
                    'Password is required when using --email in non-interactive mode.\n' +
                        'Set the LIGHTDASH_CLI_PASSWORD environment variable:\n\n' +
                        `  export LIGHTDASH_CLI_PASSWORD='your_password'\n` +
                        `  lightdash login ${url} --email ${email} --non-interactive\n`,
                );
            }

            // Show guidance for coding agents before prompting
            console.error(
                `\n${styles.secondary(
                    '💡 Tip for coding agents:',
                )} To avoid interactive prompts, exit and run:\n` +
                    `   export LIGHTDASH_CLI_PASSWORD='your_password'\n` +
                    `   lightdash login ${url} --email ${email}\n`,
            );

            const answers = await inquirer.prompt<{ password: string }>([
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter your password:',
                    mask: '*',
                },
            ]);
            finalPassword = answers.password;
        }
        loginResult = await loginWithEmailPassword(url, email, finalPassword);
    } else {
        loginResult = await loginWithOauth(url);
    }

    const { userUuid, token, organizationUuid } = loginResult;

    GlobalState.debug(`> Logged in with userUuid: ${userUuid}`);

    await LightdashAnalytics.track({
        event: 'login.completed',
        properties: {
            userId: userUuid,
            organizationId: organizationUuid,
            url,
            method: loginMethod,
        },
    });
    await setContext({
        serverUrl: url,
        apiKey: token,
    });

    GlobalState.debug(`> Saved config on: ${configFilePath}`);

    await setDefaultUser(userUuid, organizationUuid);

    console.error(`\n  ✅️ Login successful\n`);

    try {
        if (options.project) {
            await setProjectCommand(undefined, options.project);
        } else if (GlobalState.isNonInteractive()) {
            // In non-interactive mode, auto-select the first project (same as CI=true)
            await setFirstProject();
        } else {
            const project = await setProjectCommand();

            if (project === undefined) {
                console.error(
                    'Now you can add your first project to lightdash by doing: ',
                );
                console.error(
                    `\n  ${styles.bold(`⚡️ lightdash deploy --create`)}\n`,
                );
            }
        }
    } catch {
        console.error('Unable to select projects, try with: ');
        console.error(
            `\n  ${styles.bold(`⚡️ lightdash config set-project`)}\n`,
        );
    }
};
