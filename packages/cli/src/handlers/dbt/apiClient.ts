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

            if (!r.ok) {
                const contentType = r.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return r.json().then((d) => {
                        throw new LightdashError(d.error);
                    });
                }
                return r.text().then((text) => {
                    throw new Error(
                        `Received non-JSON response from server (status ${r.status}): ${text}`,
                    );
                });
            }
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

        // Replicates logic from ProjectService.validateProjectCreationPermissions
        switch (projectType) {
            case ProjectType.DEFAULT:
                if (
                    ability.can(
                        'create',
                        subject('Project', {
                            organizationUuid: user.organizationUuid,
                            type: ProjectType.DEFAULT,
                        }),
                    )
                ) {
                    return;
                }
                throw new ForbiddenError(
                    "You don't have permission to create projects",
                );

            case ProjectType.PREVIEW:
                if (upstreamProjectUuid) {
                    if (
                        // checks if user has permission to access upstream project
                        ability.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid: user.organizationUuid,
                                projectUuid: upstreamProjectUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError(
                            "Unable to create preview project: you don't have permission to access upstream project",
                        );
                    }

                    if (
                        // checks if user has permission to create project from an upstream project on a project level
                        ability.can(
                            'create',
                            subject('Project', {
                                upstreamProjectUuid,
                                type: ProjectType.PREVIEW,
                            }),
                        )
                    ) {
                        return;
                    }
                }

                if (
                    // checks if user has permission to create project on an organization level
                    ability.can(
                        'create',
                        subject('Project', {
                            organizationUuid: user.organizationUuid,
                            type: ProjectType.PREVIEW,
                        }),
                    )
                ) {
                    return;
                }

                throw new ForbiddenError(
                    "You don't have permission to create preview projects",
                );

            default:
                throw new Error(`Unknown project type: ${projectType}`);
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
