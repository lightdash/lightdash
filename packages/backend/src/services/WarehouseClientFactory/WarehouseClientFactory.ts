import {
    assertUnreachable,
    deepEqual,
    DuckdbConnectionType,
    FeatureFlags,
    ForbiddenError,
    getPersonSignIn,
    isAiAccessQueryContext,
    UnexpectedServerError,
    usesAwsWebIdentity,
    WarehouseTypes,
    type AiExecutionPlan,
    type CreateDatabricksCredentials,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type WarehouseClient,
} from '@lightdash/common';
import {
    ListedDatabasesPostgresWarehouseClient,
    SshTunnel,
    type SshTunnelOptions,
    type WarehouseClientOptions,
    type WarehouseListedDatabases,
} from '@lightdash/warehouses';
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
    | 'connection_test'
    | 'test_and_compile';

export type WarehouseCompileGroup = {
    listedDatabases: WarehouseListedDatabases;
    onSkippedDatabase: (database: string) => void;
};

type WarehouseClientBypassRef = {
    [Mode in WarehouseClientBypassMode]: {
        kind: 'bypass';
        mode: Mode;
        projectUuid: string | null;
        credentials: CreateWarehouseCredentials;
        tunnelOptions?: SshTunnelOptions;
    };
}[WarehouseClientBypassMode];

export type WarehouseClientRef =
    | {
          kind: 'binding';
          projectUuid: string;
          binding: ConnectionBinding;
          overrides?: WarehouseClientOverrides;
          preloadedOrgWarehouseCredentialsUuid?: string | null;
      }
    | {
          kind: 'resolved';
          projectUuid: string;
          credentials: CreateWarehouseCredentials & {
              userWarehouseCredentialsUuid?: string;
          };
          aiPlan: AiExecutionPlan | null;
          warehouseConnectionUuid: string | null;
          connectionRoute: ConnectionRouteWithOriginal | null;
          overrides?: WarehouseClientOverrides;
      }
    | {
          kind: 'compile';
          projectUuid: string;
          credentials: CreateWarehouseCredentials;
          compileGroup?: WarehouseCompileGroup;
      }
    | WarehouseClientBypassRef;

export type ResolvedWarehouseConnection = {
    warehouseCredentials: CreateWarehouseCredentials & {
        userWarehouseCredentialsUuid?: string;
    };
    aiPlan: AiExecutionPlan | null;
    warehouseConnectionUuid: string | null;
    connectionRoute: ConnectionRouteWithOriginal | null;
    credentialKind: WarehouseCredentialKind;
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
    deriveClient: (
        credentials: CreateWarehouseCredentials,
        options?: { compileGroup?: WarehouseCompileGroup },
    ) => WarehouseClient;
};

export type WarehouseConnectionLease = ScopedWarehouseConnection & {
    release: () => Promise<void>;
};

export type WarehouseConnectionLeaseRef =
    | Extract<WarehouseClientRef, { kind: 'compile' }>
    | Extract<WarehouseClientRef, { kind: 'bypass'; mode: 'test_and_compile' }>;

type WarehouseClientFactoryDependencies = {
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
    aiAccessService: AiAccessService;
    credentialSource: WarehouseCredentialSource;
    logger: typeof Logger;
};

export class WarehouseClientConstructionError extends Error {
    readonly originalError: unknown;

    constructor(originalError: unknown) {
        super('Warehouse client construction failed');
        this.originalError = originalError;
    }
}

export class WarehouseClientFactory {
    warehouseClients: Record<string, WarehouseClient> = {};

    private readonly clientOptions = new WeakMap<
        object,
        WarehouseClientOptions
    >();

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly aiAccessService: AiAccessService;

    private readonly credentialSource: WarehouseCredentialSource;

    private readonly logger: typeof Logger;

    private readonly releaseSshTunnelOnScopeExit: boolean;

    constructor(deps: WarehouseClientFactoryDependencies) {
        this.lightdashConfig = deps.lightdashConfig;
        this.projectModel = deps.projectModel;
        this.featureFlagModel = deps.featureFlagModel;
        this.aiAccessService = deps.aiAccessService;
        this.credentialSource = deps.credentialSource;
        this.logger = deps.logger;
        this.releaseSshTunnelOnScopeExit =
            deps.lightdashConfig?.warehouseClient
                ?.releaseSshTunnelOnScopeExit ?? true;
        if (!this.releaseSshTunnelOnScopeExit) {
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

    private getCredentialKind(
        credentials: ResolvedWarehouseConnection['warehouseCredentials'],
        aiPlan: AiExecutionPlan | null,
        purpose: ConnectionContext['purpose'],
    ): WarehouseCredentialKind {
        if (purpose === 'compile') return WarehouseCredentialKind.COMPILE;
        if (aiPlan?.identity === 'connected_person')
            return WarehouseCredentialKind.AI_SERVICE_ACCOUNT;
        if (credentials.userWarehouseCredentialsUuid)
            return WarehouseCredentialKind.PERSONAL;
        return WarehouseCredentialKind.SHARED;
    }

    async resolveWarehouseCredentials(
        ref: Extract<WarehouseClientRef, { kind: 'binding' }>,
        context: ConnectionContext,
    ): Promise<ResolvedWarehouseConnection> {
        const base = await this.credentialSource.loadBase(ref, context);
        const { aiPlan: resolvedPlan, ...warehouseCredentials } =
            await this.resolveLoadedCredentials(base, context);
        const aiPlan = resolvedPlan ?? null;
        return {
            warehouseCredentials,
            aiPlan,
            warehouseConnectionUuid: base.warehouseConnectionUuid,
            connectionRoute: base.connectionRoute,
            credentialKind: this.getCredentialKind(
                warehouseCredentials,
                aiPlan,
                context.purpose,
            ),
        };
    }

    async withWarehouseClient<T>(
        ref: WarehouseClientRef,
        context: ConnectionContext,
        fn: (connection: ScopedWarehouseConnection) => Promise<T>,
    ): Promise<T> {
        const { release, ...connection } = await this.acquireConnection(
            ref,
            context,
        );
        try {
            return await fn(connection);
        } finally {
            await release();
        }
    }

    async acquireWarehouseConnection(
        ref: WarehouseConnectionLeaseRef,
        context: ConnectionContext,
    ): Promise<WarehouseConnectionLease> {
        return this.acquireConnection(ref, context);
    }

    private async acquireConnection(
        ref: WarehouseClientRef,
        context: ConnectionContext,
    ): Promise<WarehouseConnectionLease> {
        let warehouseCredentials: ScopedWarehouseConnection['warehouseCredentials'];
        let aiPlan: AiExecutionPlan | null = null;
        let warehouseConnectionUuid: string | null = null;
        let connectionRoute: ConnectionRouteWithOriginal | null = null;
        let credentialKind: WarehouseCredentialKind | undefined;
        let overrides: Parameters<WarehouseClientFactory['acquireUnscoped']>[2];
        let tunnelOptions: SshTunnelOptions | undefined;
        switch (ref.kind) {
            case 'binding': {
                ({
                    warehouseCredentials,
                    aiPlan,
                    warehouseConnectionUuid,
                    connectionRoute,
                    credentialKind,
                } = await this.resolveWarehouseCredentials(ref, context));
                overrides = {
                    ...ref.overrides,
                    aiPlan,
                    agentSession:
                        context.queryContext !== null &&
                        isAiAccessQueryContext(context.queryContext),
                };
                break;
            }
            case 'resolved': {
                warehouseCredentials = ref.credentials;
                aiPlan = ref.aiPlan;
                warehouseConnectionUuid = ref.warehouseConnectionUuid;
                connectionRoute = ref.connectionRoute;
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
        credentialKind ??= this.getCredentialKind(
            warehouseCredentials,
            aiPlan,
            ref.kind === 'compile' ? 'compile' : context.purpose,
        );
        const { warehouseClient, sshTunnel, tunnelConnectMs } =
            await this.acquireUnscoped(
                ref.projectUuid,
                warehouseCredentials,
                overrides,
                tunnelOptions,
                context.organizationUuid,
                {
                    cacheEnabled:
                        ref.kind !== 'bypass' && ref.kind !== 'compile',
                    compileGroup:
                        ref.kind === 'compile' ? ref.compileGroup : undefined,
                    clientOptions:
                        ref.kind === 'compile' ||
                        (ref.kind === 'bypass' &&
                            ref.mode === 'test_and_compile')
                            ? { maxOpenConnections: undefined }
                            : undefined,
                    wrapConstructionErrors:
                        ref.kind === 'bypass' && ref.mode === 'connection_test',
                },
            );
        const clientOptions = this.clientOptions.get(warehouseClient) ?? {};
        let releasePromise: Promise<void> | null = null;
        return {
            warehouseClient,
            warehouseCredentials,
            aiPlan,
            warehouseConnectionUuid,
            connectionRoute,
            credentialKind,
            tunnelConnectMs,
            deriveClient: (credentials, options) => {
                const scopedCredentials = warehouseClient.credentials;
                if (credentials.type !== scopedCredentials.type) {
                    throw new UnexpectedServerError(
                        'Derived warehouse client must use the scope warehouse type',
                    );
                }
                if (
                    'useSshTunnel' in warehouseCredentials &&
                    warehouseCredentials.useSshTunnel &&
                    'host' in scopedCredentials &&
                    'port' in scopedCredentials &&
                    (!('host' in credentials) ||
                        !('port' in credentials) ||
                        credentials.host !== scopedCredentials.host ||
                        credentials.port !== scopedCredentials.port)
                ) {
                    throw new UnexpectedServerError(
                        'Derived warehouse client must use the scope tunnel host and port',
                    );
                }
                return this.withSharedSignInAttribution(
                    ref.projectUuid,
                    credentials,
                    this.buildClient(
                        { ...credentials },
                        clientOptions,
                        options?.compileGroup,
                    ),
                    aiPlan,
                );
            },
            release: () => {
                releasePromise ??= this.releaseSshTunnelOnScopeExit
                    ? sshTunnel.disconnect()
                    : Promise.resolve();
                return releasePromise;
            },
        };
    }

    private buildClient(
        credentials: CreateWarehouseCredentials,
        options: WarehouseClientOptions,
        compileGroup?: WarehouseCompileGroup,
    ): WarehouseClient {
        return compileGroup && credentials.type === WarehouseTypes.POSTGRES
            ? new ListedDatabasesPostgresWarehouseClient(
                  credentials,
                  compileGroup.listedDatabases,
                  compileGroup.onSkippedDatabase,
              )
            : this.projectModel.getWarehouseClientFromCredentials(
                  credentials,
                  options,
              );
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
        {
            cacheEnabled,
            wrapConstructionErrors,
            compileGroup,
            clientOptions: requestedClientOptions,
        }: {
            cacheEnabled: boolean;
            wrapConstructionErrors: boolean;
            compileGroup?: WarehouseCompileGroup;
            clientOptions?: Pick<WarehouseClientOptions, 'maxOpenConnections'>;
        } = { cacheEnabled: true, wrapConstructionErrors: false },
    ): Promise<{
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        tunnelConnectMs: number | null;
    }> {
        Sentry.setTag('warehouse.type', credentials.type);

        const sshTunnel = new SshTunnel(credentials, tunnelOptions);
        let constructingClient = false;
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
                usedSshTunnel || !cacheEnabled
                    ? undefined
                    : this.warehouseClients[cacheKey]
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

            constructingClient = true;
            const identityOptions = usesAwsWebIdentity(credentialsWithOverrides)
                ? await this.projectModel.getWarehouseClientIdentityOptions(
                      credentialsWithOverrides,
                      projectUuid === null
                          ? (organizationUuid ?? undefined)
                          : (await this.projectModel.getSummary(projectUuid))
                                .organizationUuid,
                  )
                : {};
            const clientOptions: WarehouseClientOptions = {
                agentSession,
                enableInstanceCache,
                projectUuid: projectUuid ?? undefined,
                logger: this.logger,
                ...identityOptions,
                ...requestedClientOptions,
            };
            const client = this.buildClient(
                credentialsWithOverrides,
                clientOptions,
                compileGroup,
            );
            this.clientOptions.set(client, clientOptions);
            if (cacheEnabled && !usedSshTunnel)
                this.warehouseClients[cacheKey] = client;
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
            if (constructingClient && wrapConstructionErrors) {
                throw new WarehouseClientConstructionError(error);
            }
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
        const attributed = attributeClientErrors(client, (error) =>
            this.attributeSharedSignInExpiry(projectUuid, credentials, error),
        );
        this.clientOptions.set(
            attributed,
            this.clientOptions.get(client) ?? {},
        );
        return attributed;
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
