import { AuthorizationError } from '@lightdash/common';
import inquirer from 'inquirer';
import fetch from 'node-fetch';
import { URL } from 'url';
import { LightdashAnalytics } from '../analytics/analytics';
import { configFilePath, setContext, setDefaultUser } from '../config';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { checkLightdashVersion } from './dbt/apiClient';
import { generatePersonalAccessToken } from './login/pat';
import { loginWithOauth } from './oauthLogin';
import { setFirstProject, setProjectCommand } from './setProject';
import { buildRequestHeaders } from './utils';

type LoginOptions = {
    /** Associated with a Personal Access Token or Service Account Token */
    token?: string;
    /** Use OAuth2 flow instead of password/token */
    oauth?: boolean;
    /** Project UUID to select after login */
    project?: string;
    interactive?: boolean;
    verbose: boolean;
};

// Helper function to determine login method
const getLoginMethod = (options: LoginOptions): string => {
    if (options.oauth) return 'oauth';
    if (options.token) return 'token';
    return 'password';
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

const loginWithPassword = async (url: string) => {
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'email',
        },
        {
            type: 'password',
            name: 'password',
        },
    ]);
    const { email, password } = answers;
    const loginUrl = new URL(`/api/v1/login`, url).href;
    const response = await fetch(loginUrl, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    GlobalState.debug(`> Login response status: ${response.status}`);

    switch (response.status) {
        case 200:
            break;
        case 401:
            throw new AuthorizationError(
                `Unable to authenticate: invalid email or password`,
            );
        default:
            // This error doesn't return a valid JSON, so we use .text instead
            throw new AuthorizationError(
                `Unable to authenticate: (${
                    response.status
                }) ${await response.text()}\nIf you use single sign-on (SSO) in the browser, login with a personal access token.`,
            );
    }

    const loginBody = await response.json();
    const header = response.headers.get('set-cookie');
    if (header === null) {
        throw new AuthorizationError(
            `Cannot sign in:\n${JSON.stringify(loginBody)}`,
        );
    }
    const { userUuid, organizationUuid } = loginBody.results;
    const cookie = header.split(';')[0].split('=')[1];

    const patToken = await generatePersonalAccessToken(
        {
            Cookie: `connect.sid=${cookie}`,
        },
        url,
    );

    return {
        userUuid,
        organizationUuid,
        token: patToken,
    };
};

export const login = async (url: string, options: LoginOptions) => {
    GlobalState.setVerbose(options.verbose);
    await checkLightdashVersion();

    GlobalState.debug(`> Login URL: ${url}`);

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
    if (options.oauth) {
        loginResult = await loginWithOauth(url);
    } else if (options.token) {
        loginResult = await loginWithToken(url, options.token);
    } else {
        loginResult = await loginWithPassword(url);
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
