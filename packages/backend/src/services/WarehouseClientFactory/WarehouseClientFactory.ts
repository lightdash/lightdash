import {
    assertUnreachable,
    deepEqual,
    DuckdbConnectionType,
    FeatureFlags,
    ForbiddenError,
    getPersonSignIn,
    isAiAccessQueryContext,
    usesAwsWebIdentity,
    WarehouseTypes,
    type AiExecutionPlan,
    type CreateDatabricksCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type WarehouseClient,
} from '@lightdash/common';
import { SshTunnel, type SshTunnelOptions } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import type { LightdashConfig } from '../../config/parseConfig';
import type Logger from '../../logging/logger';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type {
    ConnectionBinding,
    ConnectionRouteWithOriginal,
} from '../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import {
    attributeClientErrors,
    isWarehouseTokenError,
    withSharedSignInExpiry,
} from '../../utils/sharedSignInExpiry';
import type { AiAccessService } from '../AiAccessService/AiAccessService';
import { createAnalyticsClient } from '../ProjectService/analyticsProject/analyticsProjectClient';
import {
    WarehouseCredentialKind,
    type ConnectionContext,
} from './ConnectionContext';
import type {
    ResolvedWarehouseCredentials,
    WarehouseCredentialBase,
    WarehouseCredentialResolutionContext,
    WarehouseCredentialSource,
} from './WarehouseCredentialSource';

export type WarehouseClientOverrides = {
    snowflakeVirtualWarehouse?: string;
    databricksCompute?: string;
};

export type WarehouseClientBypassMode =
    | 'dbt_cloud_preview_webhook'
    | 'timezone_preview'
    | 'git_sql_builder'
    | 'test_and_compile';

export type WarehouseClientRef =
    | {
          kind: 'binding';
          projectUuid: string;
          binding: ConnectionBinding;
          overrides?: WarehouseClientOverrides;
          preloadedOrgWarehouseCredentialsUuid?: string | null;
      }
    | {
          kind: 'compile';
          projectUuid: string;
          credentials: CreateWarehouseCredentials;
      }
    | {
          kind: 'bypass';
          mode: WarehouseClientBypassMode;
          projectUuid: string | null;
          credentials: CreateWarehouseCredentials;
          tunnelOptions?: SshTunnelOptions;
      };

export type ScopedWarehouseConnection = {
    warehouseClient: WarehouseClient;
    warehouseCredentials: CreateWarehouseCredentials & {
        userWarehouseCredentialsUuid?: string;
    };
    aiPlan: AiExecutionPlan | null;
    warehouseConnectionUuid: string | null;
    connectionRoute: ConnectionRouteWithOriginal | null;
    credentialKind: WarehouseCredentialKind;
    tunnelConnectMs: number | null;
};

type WarehouseClientFactoryDependencies = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    aiAccessService: AiAccessService;
    credentialSource: WarehouseCredentialSource;
    logger: typeof Logger;
};

export class WarehouseClientFactory {
    warehouseClients: Record<string, WarehouseClient> = {};

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly aiAccessService: AiAccessService;

    private readonly credentialSource: WarehouseCredentialSource;

    private readonly logger: typeof Logger;

    constructor(deps: WarehouseClientFactoryDependencies) {
        this.lightdashConfig = deps.lightdashConfig;
        this.projectModel = deps.projectModel;
        this.featureFlagModel = deps.featureFlagModel;
        this.aiAccessService = deps.aiAccessService;
        this.credentialSource = deps.credentialSource;
        this.logger = deps.logger;
        if (!this.lightdashConfig.warehouseClient.releaseSshTunnelOnScopeExit) {
            this.logger.warn('Scoped SSH tunnel release is disabled');
        }
    }

    async resolveLoadedCredentials(
        base: WarehouseCredentialBase,
        context: WarehouseCredentialResolutionContext,
    ): Promise<ResolvedWarehouseCredentials> {
        if (base.kind === 'final') {
            return {
                ...base.credentials,
                userWarehouseCredentialsUuid: undefined,
            };
        }
        let aiPlan: AiExecutionPlan | null = null;
        if (
            context.queryContext &&
            isAiAccessQueryContext(context.queryContext)
        ) {
            const { person } = context.actor;
            const organizationUuid =
                base.organizationUuid ?? context.organizationUuid;
            if (person === null || organizationUuid === null) {
                throw new ForbiddenError(
                    'AI access requires a connection person and organization',
                );
            }
            aiPlan = await this.aiAccessService.resolvePlan({
                projectUuid: base.projectUuid,
                organizationUuid,
                warehouseConnectionUuid: base.warehouseConnectionUuid,
                connection: base.credentials,
                context: context.queryContext,
                userUuid: person.userUuid,
                isRegisteredUser: person.isRegisteredUser,
                isServiceAccount: person.isServiceAccount,
            });
        }
        if (aiPlan?.identity === 'connected_person') {
            return {
                ...aiPlan.credentials,
                userWarehouseCredentialsUuid: undefined,
                aiPlan,
            };
        }
        const credentials = await this.credentialSource.finish(base, context);
        if (base.kind === 'extra' && context.purpose === 'compile')
            return credentials;
        return { ...credentials, ...(aiPlan ? { aiPlan } : {}) };
    }

    async withWarehouseClient<T>(
        ref: WarehouseClientRef,
        context: ConnectionContext,
        fn: (connection: ScopedWarehouseConnection) => Promise<T>,
    ): Promise<T> {
        let warehouseCredentials: ScopedWarehouseConnection['warehouseCredentials'];
        let aiPlan: AiExecutionPlan | null = null;
        let warehouseConnectionUuid: string | null = null;
        let connectionRoute: ConnectionRouteWithOriginal | null = null;
        let overrides: Parameters<WarehouseClientFactory['acquireUnscoped']>[2];
        let tunnelOptions: SshTunnelOptions | undefined;
        switch (ref.kind) {
            case 'binding': {
                const base = await this.credentialSource.loadBase(ref, context);
                const { aiPlan: resolvedPlan, ...credentials } =
                    await this.resolveLoadedCredentials(base, context);
                warehouseCredentials = credentials;
                aiPlan = resolvedPlan ?? null;
                warehouseConnectionUuid = base.warehouseConnectionUuid;
                connectionRoute = base.connectionRoute;
                overrides = {
                    ...ref.overrides,
                    aiPlan,
                    agentSession:
                        context.queryContext !== null &&
                        isAiAccessQueryContext(context.queryContext),
                };
                break;
            }
            case 'compile':
                warehouseCredentials = ref.credentials;
                break;
            case 'bypass':
                this.logger.debug(
                    `Warehouse client credential bypass: ${ref.mode}`,
                );
                warehouseCredentials = ref.credentials;
                tunnelOptions = ref.tunnelOptions;
                break;
            default:
                return assertUnreachable(
                    ref,
                    'Unknown warehouse client reference',
                );
        }
        let credentialKind = WarehouseCredentialKind.SHARED;
        if (ref.kind === 'compile' || context.purpose === 'compile') {
            credentialKind = WarehouseCredentialKind.COMPILE;
        } else if (aiPlan?.identity === 'connected_person') {
            credentialKind = WarehouseCredentialKind.AI_SERVICE_ACCOUNT;
        } else if (warehouseCredentials.userWarehouseCredentialsUuid) {
            credentialKind = WarehouseCredentialKind.PERSONAL;
        }
        const { warehouseClient, sshTunnel, tunnelConnectMs } =
            await this.acquireUnscoped(
                ref.projectUuid,
                warehouseCredentials,
                overrides,
                tunnelOptions,
                context.organizationUuid,
            );
        try {
            return await fn({
                warehouseClient,
                warehouseCredentials,
                aiPlan,
                warehouseConnectionUuid,
                connectionRoute,
                credentialKind,
                tunnelConnectMs,
            });
        } finally {
            if (
                this.lightdashConfig.warehouseClient.releaseSshTunnelOnScopeExit
            ) {
                await sshTunnel.disconnect();
            }
        }
    }

    async acquireUnscoped(
        projectUuid: string | null,
        credentials: CreateWarehouseCredentials,
        overrides?: {
            aiPlan?: AiExecutionPlan | null;
            agentSession?: boolean;
            snowflakeVirtualWarehouse?: string;
            databricksCompute?: string;
        },
        tunnelOptions?: SshTunnelOptions,
        organizationUuid: string | null = null,
    ): Promise<{
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        tunnelConnectMs: number | null;
    }> {
        Sentry.setTag('warehouse.type', credentials.type);

        const sshTunnel = new SshTunnel(credentials, tunnelOptions);
        try {
            if (
                credentials.type === WarehouseTypes.DUCKDB &&
                credentials.connectionType === DuckdbConnectionType.ANALYTICS
            ) {
                if (projectUuid === null)
                    throw new ForbiddenError(
                        'Invalid internal analytics project',
                    );
                const project = await this.projectModel.get(projectUuid);
                if (project.provisioningSource !== 'analytics') {
                    throw new ForbiddenError(
                        'Invalid internal analytics project',
                    );
                }
                return {
                    warehouseClient: await createAnalyticsClient(
                        project.organizationUuid,
                        this.featureFlagModel,
                    ),
                    sshTunnel,
                    tunnelConnectMs: null,
                };
            }
            const usedSshTunnel =
                'useSshTunnel' in credentials && !!credentials.useSshTunnel;
            const tunnelStart = performance.now();
            const warehouseSshCredentials = await sshTunnel.connect();
            const tunnelConnectMs = usedSshTunnel
                ? performance.now() - tunnelStart
                : null;

            const { snowflakeVirtualWarehouse, databricksCompute, aiPlan } =
                overrides || {};

            const agentSession = overrides?.agentSession ?? !!aiPlan;

            const cacheKey = `${agentSession ? 'agent:' : ''}${projectUuid}${snowflakeVirtualWarehouse || ''}${
                databricksCompute || ''
            }${aiPlan ? JSON.stringify([aiPlan.identity === 'connected_person' ? aiPlan.identityUuid : aiPlan.audit.personUuid]) : ''}`;

            const existingClient = (
                usedSshTunnel ? undefined : this.warehouseClients[cacheKey]
            ) as (typeof this.warehouseClients)[string] | undefined;
            if (
                existingClient &&
                deepEqual(existingClient.credentials, warehouseSshCredentials)
            ) {
                return {
                    warehouseClient: this.withSharedSignInAttribution(
                        projectUuid,
                        credentials,
                        existingClient,
                        aiPlan,
                    ),
                    sshTunnel,
                    tunnelConnectMs,
                };
            }

            const getSnowflakeWarehouse = (
                snowflakeCredentials: CreateSnowflakeCredentials,
            ): string => {
                if (snowflakeCredentials.override) {
                    this.logger.debug(
                        `Overriding snowflake warehouse ${snowflakeVirtualWarehouse} with ${snowflakeCredentials.warehouse}`,
                    );
                    return snowflakeCredentials.warehouse;
                }
                return (
                    snowflakeVirtualWarehouse || snowflakeCredentials.warehouse
                );
            };

            const credsType = warehouseSshCredentials.type;
            let credentialsWithOverrides: CreateWarehouseCredentials;

            switch (credsType) {
                case WarehouseTypes.SNOWFLAKE:
                    credentialsWithOverrides = {
                        ...warehouseSshCredentials,
                        warehouse: getSnowflakeWarehouse(
                            warehouseSshCredentials,
                        ),
                    };
                    break;
                case WarehouseTypes.DATABRICKS:
                    const getDatabricksHttpPath = (
                        databricksCredentials: CreateDatabricksCredentials,
                    ): string => {
                        if (databricksCredentials.compute) {
                            return (
                                databricksCredentials.compute.find(
                                    (compute) =>
                                        compute.name === databricksCompute,
                                )?.httpPath ?? databricksCredentials.httpPath
                            );
                        }
                        return databricksCredentials.httpPath;
                    };

                    credentialsWithOverrides = {
                        ...warehouseSshCredentials,
                        httpPath: getDatabricksHttpPath(
                            warehouseSshCredentials,
                        ),
                    };
                    break;
                case WarehouseTypes.REDSHIFT:
                case WarehouseTypes.POSTGRES:
                case WarehouseTypes.BIGQUERY:
                case WarehouseTypes.TRINO:
                case WarehouseTypes.CLICKHOUSE:
                case WarehouseTypes.ATHENA:
                case WarehouseTypes.DUCKDB:
                    credentialsWithOverrides = warehouseSshCredentials;
                    break;
                default:
                    return assertUnreachable(
                        credsType,
                        `Unknown warehouse type: ${credsType}`,
                    );
            }

            const { enabled, projectUuids } =
                this.lightdashConfig.motherduckInstanceCache;
            const emptyAllowlistEnablesAllProjects =
                this.lightdashConfig.lightdashCloudInstance === undefined;
            const enableInstanceCache =
                enabled &&
                ((projectUuid !== null && projectUuids.includes(projectUuid)) ||
                    (projectUuids.length === 0 &&
                        emptyAllowlistEnablesAllProjects));

            const identityOptions = usesAwsWebIdentity(credentialsWithOverrides)
                ? await this.projectModel.getWarehouseClientIdentityOptions(
                      credentialsWithOverrides,
                      projectUuid === null
                          ? (organizationUuid ?? undefined)
                          : (await this.projectModel.getSummary(projectUuid))
                                .organizationUuid,
                  )
                : {};
            const client = this.projectModel.getWarehouseClientFromCredentials(
                credentialsWithOverrides,
                {
                    agentSession,
                    enableInstanceCache,
                    projectUuid: projectUuid ?? undefined,
                    logger: this.logger,
                    ...identityOptions,
                },
            );
            if (!usedSshTunnel) this.warehouseClients[cacheKey] = client;
            return {
                warehouseClient: this.withSharedSignInAttribution(
                    projectUuid,
                    credentials,
                    client,
                    aiPlan,
                ),
                sshTunnel,
                tunnelConnectMs,
            };
        } catch (error) {
            await sshTunnel.disconnect();
            throw error;
        }
    }

    private withSharedSignInAttribution<T extends object>(
        projectUuid: string | null,
        credentials: CreateWarehouseCredentials,
        client: T,
        aiPlan?: AiExecutionPlan | null,
    ): T {
        if (aiPlan?.identity === 'connected_person') return client;
        if (projectUuid === null || !getPersonSignIn(credentials))
            return client;
        return attributeClientErrors(client, (error) =>
            this.attributeSharedSignInExpiry(projectUuid, credentials, error),
        );
    }

    async attributeSharedSignInExpiry(
        projectUuid: string | null,
        credentials: CreateWarehouseCredentials,
        error: unknown,
    ): Promise<never> {
        const signIn = getPersonSignIn(credentials);
        if (projectUuid === null || !isWarehouseTokenError(error) || !signIn)
            throw error;
        try {
            const { organizationUuid } =
                await this.projectModel.getSummary(projectUuid);
            const { enabled } = await this.featureFlagModel.get({
                user: { organizationUuid },
                featureFlagId: FeatureFlags.SharedSignInExpiryMessage,
            });
            const stored = enabled
                ? await this.projectModel.getSharedSignInSubjectForToken(
                      projectUuid,
                      signIn.refreshToken,
                  )
                : null;
            if (!stored) throw error;
            throw withSharedSignInExpiry(
                error,
                {
                    projectUuid,
                    provider: stored.provider,
                    subjectUserUuid: stored.subject?.userUuid ?? null,
                    subjectName: stored.subject?.name || null,
                    subjectBasis: stored.basis,
                },
                null,
            );
        } catch (attributed) {
            if (isWarehouseTokenError(attributed)) throw attributed;
            throw error;
        }
    }
}
