import {
    ApiError,
    ApiHealthResults,
    ApiResponse,
    AuthorizationError,
    LightdashError,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';
import fetch, { BodyInit } from 'node-fetch';
import { URL } from 'url';
import { getConfig } from '../../config';
import GlobalState from '../../globalState';
import * as styles from '../../styles';

const { version: VERSION } = require('../../../package.json');

type LightdashApiProps = {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    url: string;
    body: BodyInit | undefined;
};
export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
}: LightdashApiProps): Promise<T> => {
    const config = await getConfig();
    if (!(config.context?.apiKey && config.context.serverUrl)) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${config.context.apiKey}`,
        [LightdashRequestMethodHeader]:
            process.env.CI === 'true'
                ? RequestMethod.CLI_CI
                : RequestMethod.CLI,
    };
    const fullUrl = new URL(url, config.context.serverUrl).href;
    GlobalState.debug(`> Making HTTP query to: ${fullUrl}`);

    return fetch(fullUrl, { method, headers, body })
        .then((r) => {
            GlobalState.debug(`> HTTP request returned status: ${r.status}`);

            if (!r.ok)
                return r.json().then((d) => {
                    throw new LightdashError(d.error);
                });
            return r;
        })
        .then((r) => r.json())
        .then((d: ApiResponse | ApiError) => {
            GlobalState.debug(`> HTTP request returned status: ${d.status}`);

            switch (d.status) {
                case 'ok':
                    return d.results as T;
                case 'error':
                    throw new LightdashError(d.error);
                default:
                    throw new Error(d);
            }
        })
        .catch((err) => {
            throw err;
        });
};

export const checkLightdashVersion = async (): Promise<void> => {
    try {
        const health = await lightdashApi<ApiHealthResults>({
            method: 'GET',
            url: `/api/v1/health`,
            body: undefined,
        });
        if (health.version !== VERSION) {
            const config = await getConfig();
            console.error(
                `${styles.title(
                    'Warning',
                )}: CLI (${VERSION}) is running a different version than Lightdash (${
                    health.version
                }) on ${
                    config.context?.serverUrl
                }.\n         Some commands may fail, consider upgrading your CLI by doing: ${styles.secondary(
                    `npm install -g @lightdash/cli@${health.version}`,
                )}`,
            );
        }
    } catch (err) {
        // do nothing
    }
};
