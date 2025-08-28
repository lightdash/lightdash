import { Ability, subject } from '@casl/ability';
import {
    ApiError,
    ApiHealthResults,
    ApiResponse,
    AuthorizationError,
    ForbiddenError,
    LightdashError,
    ProjectType,
    type LightdashUserWithAbilityRules,
    type PossibleAbilities,
} from '@lightdash/common';
import fetch, { BodyInit } from 'node-fetch';
import { URL } from 'url';
import { getConfig } from '../../config';
import { CLI_VERSION } from '../../env';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { buildRequestHeaders } from '../utils';

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
    const headers = buildRequestHeaders(config.context.apiKey);
    const fullUrl = new URL(url, config.context.serverUrl).href;
    GlobalState.debug(`> Making HTTP ${method} request to: ${fullUrl}`);

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
            // ApiErrorResponse
            throw err;
        });
};

export const getUserContext =
    async (): Promise<LightdashUserWithAbilityRules> =>
        lightdashApi<LightdashUserWithAbilityRules>({
            method: 'GET',
            url: `/api/v1/user`,
            body: undefined,
        });

export const checkProjectCreationPermission = async (
    upstreamProjectUuid: string | undefined,
    projectType: ProjectType,
): Promise<void> => {
    try {
        const user = await getUserContext();

        // Build CASL ability from user's ability rules (same as backend)
        const ability = new Ability<PossibleAbilities>(user.abilityRules);

        if (!user.organizationUuid) {
            throw new ForbiddenError(
                `You don't have permission to create projects.`,
            );
        }

        // Check if user has permission to create project of the specified type
        const canCreate = ability.can(
            'create',
            subject('Project', {
                organizationUuid: user.organizationUuid,
                upstreamProjectUuid,
                type: projectType,
            }),
        );

        if (!canCreate) {
            const projectTypeText =
                projectType === ProjectType.PREVIEW ? 'preview ' : '';
            throw new ForbiddenError(
                `You don't have permission to create ${projectTypeText}projects.`,
            );
        }
    } catch (err) {
        if (
            err instanceof ForbiddenError ||
            err instanceof AuthorizationError
        ) {
            throw err;
        }
        GlobalState.debug(`Failed to check permissions: ${err}`);
        // If we can't check permissions, we'll let the API call fail with proper error
    }
};

export const checkLightdashVersion = async (): Promise<void> => {
    try {
        const health = await lightdashApi<ApiHealthResults>({
            method: 'GET',
            url: `/api/v1/health`,
            body: undefined,
        });
        if (health.version !== CLI_VERSION) {
            const config = await getConfig();
            console.error(
                `${styles.title(
                    'Warning',
                )}: CLI (${CLI_VERSION}) is running a different version than Lightdash (${
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
