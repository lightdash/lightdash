import { AuthorizationError } from '@lightdash/common';
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

    let loginResult;
    if (options.token) {
        loginResult = await loginWithToken(url, options.token);
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
        } else if (process.env.CI === 'true') {
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
