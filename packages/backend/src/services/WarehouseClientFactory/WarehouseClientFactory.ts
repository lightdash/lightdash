import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertUnreachable,
    deepEqual,
    DuckdbConnectionType,
    FeatureFlags,
    ForbiddenError,
    getAiExecutionCredentialUuid,
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
import { isBigqueryServiceAccountAuthError } from '../../utils/aiServiceAccountErrors';
import {
    attributeClientErrors,
    isWarehouseTokenError,
    withSharedSignInExpiry,
} from '../../utils/sharedSignInExpiry';
import type {
    AiAccessEvaluation,
    AiAccessService,
} from '../AiAccessService/AiAccessService';
import { createAnalyticsClient } from '../ProjectService/analyticsProject/analyticsProjectClient';
import {
    getAgentActor,
    querySurfaceFromConnectionSurface,
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
        agentSession?: boolean;
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
          projectUuid: string | null;
          cachePolicy?: 'default' | 'disabled';
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
          projectUuid: string | null;
          tunnelOptions?: SshTunnelOptions;
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
    connectionCredentials: CreateWarehouseCredentials;
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

    private readonly resolveDbtCloudPreviewCredentials: boolean;

    private readonly resolveTimezonePreviewCredentials: boolean;

    private readonly resolveTestAndCompileCredentials: boolean;

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
        this.resolveDbtCloudPreviewCredentials =
            deps.lightdashConfig?.warehouseClient
                ?.resolveDbtCloudPreviewCredentials ?? true;
        this.resolveTimezonePreviewCredentials =
            deps.lightdashConfig?.warehouseClient
                ?.resolveTimezonePreviewCredentials ?? true;
        this.resolveTestAndCompileCredentials =
            deps.lightdashConfig?.warehouseClient
                ?.resolveTestAndCompileCredentials ?? true;
        if (
            deps.lightdashConfig?.warehouseClient?.resolveCompileCredentials ===
            false
        ) {
            this.logger.warn(
                'Compile credential resolution is disabled; using legacy refresh and rotation behaviour',
            );
        }
        if (!this.resolveTestAndCompileCredentials) {
            this.logger.warn(
                'Test-and-compile credential resolution is disabled; using stored credentials without refresh',
            );
        }
        if (!this.resolveTimezonePreviewCredentials) {
            this.logger.warn(
                'Timezone preview credential resolution is disabled; using raw credentials without refresh',
            );
        }
        if (!this.resolveDbtCloudPreviewCredentials) {
            this.logger.warn(
                'dbt Cloud preview credential resolution is disabled; using stored credentials without refresh',
            );
        }
        if (!this.releaseSshTunnelOnScopeExit) {
            this.logger.warn('Scoped SSH tunnel release is disabled');
        }
    }

    private aiAccessEvaluation(
        context: Pick<ConnectionContext, 'purpose' | 'aiAccess' | 'actor'>,
    ): AiAccessEvaluation {
        return context.purpose === 'compile' ||
            context.aiAccess === 'diagnostic'
            ? { kind: 'diagnostic' }
            : {
                  kind: 'query',
                  surface: querySurfaceFromConnectionSurface(
                      context.actor.surface,
                  ),
              };
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
                evaluation: this.aiAccessEvaluation(context),
                projectUuid: base.projectUuid,
                organizationUuid,
                warehouseConnectionUuid: base.warehouseConnectionUuid,
                connection: base.credentials,
                context: context.queryContext,
                userUuid: person.userUuid,
                isRegisteredUser: person.isRegisteredUser,
                isServiceAccount: person.isServiceAccount,
                serviceAccountUuid: person.serviceAccountUuid,
                oauthClientId: person.oauthClientId,
                ...(context.actor.aiClient?.surface
                    ? { agentActor: getAgentActor(context.actor) }
                    : {}),
            });
        }
        if (
            aiPlan &&
            getAiExecutionCredentialUuid(aiPlan) !== null &&
            aiPlan.identity !== 'marked_person'
        ) {
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
            return WarehouseCredentialKind.AI_AGENT_SIGN_IN;
        if (aiPlan?.identity === 'ai_service_account')
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
                tunnelOptions = ref.tunnelOptions;
                break;
            case 'bypass':
                if (
                    ref.mode === 'test_and_compile' &&
                    this.resolveTestAndCompileCredentials
                ) {
                    throw new UnexpectedServerError(
                        'Test-and-compile credential bypass requires credential resolution to be disabled',
                    );
                }
                if (
                    ref.mode === 'dbt_cloud_preview_webhook' &&
                    this.resolveDbtCloudPreviewCredentials
                ) {
                    throw new UnexpectedServerError(
                        'dbt Cloud preview credential bypass requires credential resolution to be disabled',
                    );
                }
                if (
                    ref.mode === 'timezone_preview' &&
                    this.resolveTimezonePreviewCredentials
                ) {
                    throw new UnexpectedServerError(
                        'Timezone preview credential bypass requires credential resolution to be disabled',
                    );
                }
                this.logger.debug(
                    `Warehouse client credential bypass: ${ref.mode}`,
                );
                warehouseCredentials = ref.credentials;
                tunnelOptions = ref.tunnelOptions;
                overrides = { agentSession: ref.agentSession ?? false };
                break;
            default:
                return assertUnreachable(
                    ref,
                    'Unknown warehouse client reference',
                );
        }
        const refusalScope = {
            context,
            warehouseConnectionUuid,
            refused: false,
        };
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
                    refusalScope,
                    warehouseConnectionUuid,
                    cacheEnabled:
                        ref.kind !== 'bypass' &&
                        ref.kind !== 'compile' &&
                        !(
                            ref.kind === 'resolved' &&
                            ref.cachePolicy === 'disabled'
                        ),
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
        const connectionCredentials = sshTunnel.overrideCredentials;
        const clientOptions = this.clientOptions.get(warehouseClient) ?? {};
        let releasePromise: Promise<void> | null = null;
        return {
            warehouseClient,
            connectionCredentials,
            warehouseCredentials,
            aiPlan,
            warehouseConnectionUuid,
            connectionRoute,
            credentialKind,
            tunnelConnectMs,
            deriveClient: (credentials, options) => {
                const scopedCredentials = connectionCredentials;
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
                    refusalScope,
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
            refusalScope,
            warehouseConnectionUuid = null,
        }: {
            cacheEnabled: boolean;
            wrapConstructionErrors: boolean;
            refusalScope?: {
                context: ConnectionContext;
                warehouseConnectionUuid: string | null;
                refused: boolean;
            };
            warehouseConnectionUuid?: string | null;
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

            const cacheKey = JSON.stringify([
                agentSession,
                projectUuid,
                warehouseConnectionUuid,
                snowflakeVirtualWarehouse ?? null,
                databricksCompute ?? null,
                aiPlan?.identity ?? null,
                aiPlan
                    ? (getAiExecutionCredentialUuid(aiPlan) ??
                      aiPlan.audit.personUuid)
                    : null,
            ]);

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
                        refusalScope,
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
                ...(credentialsWithOverrides.type === WarehouseTypes.BIGQUERY
                    ? { agentJobControls: !!aiPlan }
                    : {}),
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
                    refusalScope,
                ),
                sshTunnel,
                tunnelConnectMs,
            };
        } catch (error) {
            await sshTunnel.disconnect();
            if (
                constructingClient &&
                overrides?.aiPlan?.identity === 'ai_service_account'
            ) {
                return this.attributeAiServiceAccountError(
                    projectUuid,
                    credentials,
                    error,
                    refusalScope,
                );
            }
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
        refusalScope?: {
            context: ConnectionContext;
            warehouseConnectionUuid: string | null;
            refused: boolean;
        },
    ): T {
        if (aiPlan?.identity === 'connected_person') return client;
        if (aiPlan?.identity === 'ai_service_account') {
            const attributed = attributeClientErrors(client, (error) =>
                this.attributeAiServiceAccountError(
                    projectUuid,
                    credentials,
                    error,
                    refusalScope,
                ),
            );
            this.clientOptions.set(
                attributed,
                this.clientOptions.get(client) ?? {},
            );
            return attributed;
        }
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

    private async attributeAiServiceAccountError(
        projectUuid: string | null,
        credentials: CreateWarehouseCredentials,
        error: unknown,
        refusalScope?: {
            context: ConnectionContext;
            warehouseConnectionUuid: string | null;
            refused: boolean;
        },
    ): Promise<never> {
        if (
            credentials.type !== WarehouseTypes.BIGQUERY ||
            !isBigqueryServiceAccountAuthError(error)
        )
            throw error;
        const reason = AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID;
        const scope = refusalScope;
        if (projectUuid !== null && scope && !scope.refused) {
            scope.refused = true;
            const { context } = scope;
            const { person } = context.actor;
            this.aiAccessService.trackQueryRefusal(
                {
                    projectUuid,
                    organizationUuid: context.organizationUuid,
                    warehouseConnectionUuid: scope.warehouseConnectionUuid,
                    evaluation: this.aiAccessEvaluation(context),
                    userUuid: person?.userUuid ?? '',
                    isRegisteredUser: person?.isRegisteredUser ?? false,
                    isServiceAccount: person?.isServiceAccount ?? false,
                    agentActor: getAgentActor(context.actor),
                    warehouseType: credentials.type,
                },
                reason,
            );
        }
        throw new AiAccessRefusedError(reason, {
            settingsUrl: '/generalSettings/warehouseCredentials',
        });
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
