import { AuthorizationError } from '@lightdash/common';
import fetch from 'node-fetch';
import { URL } from 'url';
import { LightdashAnalytics } from '../analytics/analytics';
import { configFilePath, setContext, setDefaultUser } from '../config';
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
