import { Ability, subject } from '@casl/ability';
import {
    ApiError,
    ApiHealthResults,
    ApiResponse,
    AuthorizationError,
    ForbiddenError,
    LightdashError,
    ProjectType,
    SpaceMemberRole,
    type LightdashUserWithAbilityRules,
    type PossibleAbilities,
    type Project,
} from '@lightdash/common';
import fetch, { BodyInit, type Response } from 'node-fetch';
import { URL } from 'url';
import { gzipSync } from 'zlib';
import { getConfig } from '../../config';
import { CLI_VERSION, getUpdateInstructions } from '../../env';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { buildRequestHeaders } from '../utils';

type LightdashApiProps = {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    url: string;
    body: BodyInit | undefined;
};

type LightdashRawApiProps = LightdashApiProps & {
    headers?: Record<string, string>;
};

const MIN_GZIP_SIZE = 1024;
let gzipEnabled = false;

export const setGzipEnabled = (enabled: boolean) => {
    gzipEnabled = enabled;
};

export const lightdashRawApi = async ({
    method,
    url,
    body,
    headers: requestHeaders = {},
}: LightdashRawApiProps): Promise<Response> => {
    const config = await getConfig();
    if (!(config.context?.apiKey && config.context.serverUrl)) {
        throw new AuthorizationError(
            `Not logged in. Run 'lightdash login --help'`,
        );
    }
    const headers = {
        ...buildRequestHeaders(config.context.apiKey),
        ...requestHeaders,
    };
    const fullUrl = new URL(url, config.context.serverUrl).href;
    GlobalState.debug(`> Making HTTP ${method} request to: ${fullUrl}`);

    const response = await fetch(fullUrl, { method, headers, body });
    GlobalState.debug(`> HTTP request returned status: ${response.status}`);

    if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            const data = await response.json();
            throw new LightdashError(data.error);
        }
        const responseText = await response.text();
        throw new Error(
            `Received non-JSON response from server (status ${response.status}): ${responseText}`,
        );
    }

    return response;
};

export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
}: LightdashApiProps): Promise<T> => {
    const headers: Record<string, string> = {};

    let requestBody: BodyInit | undefined = body;
    if (
        gzipEnabled &&
        body &&
        typeof body === 'string' &&
        Buffer.byteLength(body) > MIN_GZIP_SIZE
    ) {
        try {
            const uncompressedSize = Buffer.byteLength(body);
            const compressed = gzipSync(body);
            GlobalState.debug(
                `> Compressed request body: ${uncompressedSize} bytes → ${compressed.byteLength} bytes (${Math.round((1 - compressed.byteLength / uncompressedSize) * 100)}% reduction)`,
            );
            requestBody = compressed;
            headers['Content-Encoding'] = 'gzip';
        } catch (err) {
            GlobalState.debug(
                `> Gzip compression failed, sending uncompressed: ${err}`,
            );
        }
    }

    return lightdashRawApi({
        method,
        url,
        body: requestBody,
        headers,
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

export type ContentAsCodeUploadPermissions = {
    charts: boolean;
    dashboards: boolean;
    virtualViews: boolean;
    alerts: boolean;
    scheduledDeliveries: boolean;
    googleSheets: boolean;
    dataApps: boolean;
    externalConnections: boolean;
};

export const getContentAsCodeUploadPermissions = async (
    projectUuid: string,
): Promise<ContentAsCodeUploadPermissions> => {
    const [user, project] = await Promise.all([
        getUserContext(),
        lightdashApi<Project>({
            method: 'GET',
            url: `/api/v1/projects/${projectUuid}`,
            body: undefined,
        }),
    ]);
    const ability = new Ability<PossibleAbilities>(user.abilityRules);

    const contentAsCodeSubject = subject('ContentAsCode', {
        organizationUuid: project.organizationUuid,
        projectUuid: project.projectUuid,
        upstreamProjectUuid: project.upstreamProjectUuid,
        type: project.type,
        createdByUserUuid: project.createdByUserUuid,
    });

    if (
        ability.cannot('create', contentAsCodeSubject) &&
        ability.cannot('manage', contentAsCodeSubject)
    ) {
        throw new ForbiddenError(
            `You don't have permission to upload content as code to project "${project.name}". The create:ContentAsCode or manage:ContentAsCode permission is required.`,
        );
    }

    const baseSubject = {
        organizationUuid: project.organizationUuid,
        projectUuid: project.projectUuid,
    };
    const accessibleResourceSubject = {
        ...baseSubject,
        upstreamProjectUuid: project.upstreamProjectUuid,
        type: project.type,
        createdByUserUuid: project.createdByUserUuid,
        inheritsFromOrgOrProject: true,
        access: [
            {
                userUuid: user.userUuid,
                role: SpaceMemberRole.ADMIN,
            },
        ],
    };
    const dataAppSubject = subject('DataApp', {
        ...baseSubject,
        upstreamProjectUuid: project.upstreamProjectUuid,
        projectType: project.type,
        projectCreatedByUserUuid: project.createdByUserUuid,
        inheritsFromOrgOrProject: true,
        access: [
            {
                userUuid: user.userUuid,
                role: SpaceMemberRole.ADMIN,
            },
        ],
    });
    const canManageScheduledDeliveries = ability.can(
        'manage',
        subject('ScheduledDeliveries', {
            ...baseSubject,
            userUuid: user.userUuid,
        }),
    );
    const canCreateScheduledDeliveries = ability.can(
        'create',
        subject('ScheduledDeliveries', { ...baseSubject }),
    );

    return {
        charts: ability.can(
            'manage',
            subject('SavedChart', { ...accessibleResourceSubject }),
        ),
        dashboards: ability.can(
            'manage',
            subject('Dashboard', { ...accessibleResourceSubject }),
        ),
        virtualViews: ability.can(
            'create',
            subject('VirtualView', { ...baseSubject }),
        ),
        alerts: canManageScheduledDeliveries || canCreateScheduledDeliveries,
        scheduledDeliveries:
            canManageScheduledDeliveries || canCreateScheduledDeliveries,
        googleSheets:
            (canManageScheduledDeliveries || canCreateScheduledDeliveries) &&
            ability.can('manage', subject('GoogleSheets', { ...baseSubject })),
        dataApps:
            ability.can('create', dataAppSubject) ||
            ability.can('manage', dataAppSubject),
        externalConnections: ability.can(
            'manage',
            subject('ExternalConnection', { ...baseSubject }),
        ),
    };
};

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
                `You don't have permission to create projects. Please ensure you're a member of an organization.`,
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
                    `You don't have permission to create projects in this organization.\n` +
                        `This typically requires the 'admin' or 'developer' role.\n` +
                        `Contact your organization admin to request access.`,
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
                            `Unable to create preview project: you don't have permission to access the upstream project.\n` +
                                `You need 'view' access to the project you're trying to preview from.\n` +
                                `Contact your admin to request access.`,
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

                if (!upstreamProjectUuid) {
                    throw new ForbiddenError(
                        `No source project is selected. If your role allows creating previews from specific projects, that permission only applies when a source project is selected.\n` +
                            `Run 'lightdash config set-project' to select a source project and try again.\n` +
                            `If that doesn't help, contact your organization admin to request access to preview projects.`,
                    );
                }

                throw new ForbiddenError(
                    `You don't have permission to create preview projects in this organization.\n` +
                        `This typically requires the 'developer' or 'admin' role.\n` +
                        `Contact your organization admin to request access.`,
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
            url: `/api/v1/health?skipMigrationCheck=true`,
            body: undefined,
        });

        const cliMajor = CLI_VERSION.split('.')[0];
        const serverMajor = health.version.split('.')[0];
        if (cliMajor !== serverMajor) {
            const config = await getConfig();
            console.error(
                `${styles.title(
                    'Warning',
                )}: CLI (${CLI_VERSION}) is running a different version than Lightdash (${
                    health.version
                }) on ${
                    config.context?.serverUrl
                }.\n         Some commands may fail, consider upgrading your CLI by ${styles.secondary(
                    getUpdateInstructions(health.version),
                )}`,
            );
        }
    } catch (err) {
        GlobalState.debug(`> Health check failed: ${err}`);
    }
};
