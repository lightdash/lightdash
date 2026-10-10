import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertUnreachable,
    FeatureFlags,
    FeatureNotEnabledError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    supportsAiServiceAccount,
    WarehouseTypes,
    type Account,
    type AiServiceAccountCredentialInput,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type ApiAiServiceAccountSaveResponse,
    type ApiAiServiceAccountStatusResponse,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { trackSafely } from '../../analytics/trackSafely';
import { createAuditLogEvent } from '../../logging/auditLog';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import { redactCredentialError } from '../../logging/redactCredentialError';
import { logAuditEvent } from '../../logging/winston';
import {
    type AiServiceAccountCredentialsModel,
    type AiServiceAccountSecrets,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import {
    getAthenaServiceAccountTestErrorMessage,
    getUserPasswordServiceAccountTestErrorMessage,
} from '../../utils/aiServiceAccountErrors';
import { assertHumanManagedMutation } from '../AgentPermissionService/assertHumanManagedMutation';
import { BaseService } from '../BaseService';
import { type ProjectService } from '../ProjectService/ProjectService';
import {
    aiServiceAccountCredentialResolvers,
    buildAiServiceAccountCredentials,
    resolveAiServiceAccountCredentials,
} from '../WarehouseClientFactory/aiServiceAccountCredentialResolvers';
import {
    connectionContextFromAccount,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import { mergeAiServiceAccountCredentials } from './applyAiServiceAccountCredentials';
import {
    AiServiceAccountSlotResolutionError,
    AiServiceAccountSlotResolver,
} from './resolveAiServiceAccountSlot';

type Dependencies = {
    analytics: Pick<LightdashAnalytics, 'track'>;
    aiServiceAccountCredentialsModel: AiServiceAccountCredentialsModel;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    warehouseConnectionModel: WarehouseConnectionModel;
    projectService: Pick<ProjectService, 'warehouseClientFactory'>;
};

const verifiedWarehouseTypes = new Set<WarehouseTypes>([
    WarehouseTypes.CLICKHOUSE,
    WarehouseTypes.POSTGRES,
    WarehouseTypes.REDSHIFT,
    WarehouseTypes.TRINO,
    WarehouseTypes.ATHENA,
    WarehouseTypes.DATABRICKS,
    WarehouseTypes.SNOWFLAKE,
]);

export class AiServiceAccountService extends BaseService {
    constructor(private readonly deps: Dependencies) {
        super();
    }

    private async loadConnection(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        resolveAuditName: boolean,
    ) {
        assertIsAccountWithOrg(account);
        const { organizationUuid, name: projectName } =
            await this.deps.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const { enabled } = await this.deps.featureFlagModel.get({
            user: { userUuid: account.user.id, organizationUuid },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        if (!enabled)
            throw new FeatureNotEnabledError(FeatureFlags.AgentIdentity);
        let warehouseConnectionUuid = connectionUuid;
        let connectionName = projectName;
        if (warehouseConnectionUuid !== null) {
            const project =
                await this.deps.warehouseConnectionModel.getProject(
                    projectUuid,
                );
            const connection = await this.deps.warehouseConnectionModel.get(
                project,
                warehouseConnectionUuid,
            );
            connectionName = connection.name;
            if (connection.isOriginal) warehouseConnectionUuid = null;
        } else if (resolveAuditName) {
            const project =
                await this.deps.warehouseConnectionModel.getProject(
                    projectUuid,
                );
            const connections =
                await this.deps.warehouseConnectionModel.list(project);
            connectionName =
                connections.find((connection) => connection.isOriginal)?.name ??
                projectName;
        }
        const connection =
            warehouseConnectionUuid === null
                ? await this.deps.projectModel.getWarehouseCredentialsForBinding(
                      projectUuid,
                      { kind: 'connection', warehouseConnectionUuid: null },
                  )
                : await this.deps.warehouseConnectionModel.getCredentials(
                      await this.deps.warehouseConnectionModel.getProject(
                          projectUuid,
                      ),
                      warehouseConnectionUuid,
                  );
        if (!supportsAiServiceAccount(connection.type)) {
            throw new ParameterError(
                'This warehouse does not support an AI service account.',
            );
        }
        return {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        };
    }

    private recordChange(
        account: Account,
        action: 'create' | 'update' | 'delete' | 'test',
        projectUuid: string,
        organizationUuid: string,
        metadata: {
            event: string;
            warehouseConnectionUuid: string | null;
            connectionName: string;
            previousGeneration: string | null;
            generation: string | null;
            inheritedFromProjectUuid: string | null;
            result: 'success' | 'failure' | null;
        },
    ): void {
        try {
            logAuditEvent(
                createAuditLogEvent(
                    createActorFromAccount(account),
                    action,
                    {
                        type: 'AiServiceAccount',
                        organizationUuid,
                        projectUuid,
                        metadata,
                    },
                    {},
                    'allowed',
                ),
            );
        } catch (error) {
            this.logger.warn(
                'Failed to write the AI service account audit event',
                redactCredentialError(error),
            );
        }
    }

    async get(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
    ): Promise<AiServiceAccountSlot | null> {
        const { warehouseConnectionUuid } = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            false,
        );
        return this.deps.aiServiceAccountCredentialsModel.getSlot(
            projectUuid,
            warehouseConnectionUuid,
        );
    }

    async getStatus(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
    ): Promise<Omit<ApiAiServiceAccountStatusResponse, 'status'>> {
        const { warehouseConnectionUuid, organizationUuid, connection } =
            await this.loadConnection(
                account,
                projectUuid,
                connectionUuid,
                false,
            );
        const results =
            await this.deps.aiServiceAccountCredentialsModel.getSlot(
                projectUuid,
                warehouseConnectionUuid,
            );
        const credentialsReadable =
            connection.type !== WarehouseTypes.BIGQUERY
                ? await this.deps.aiServiceAccountCredentialsModel.getCredentialsReadable(
                      projectUuid,
                      warehouseConnectionUuid,
                      results?.identityUuid ?? null,
                  )
                : results !== null;
        const verification = verifiedWarehouseTypes.has(connection.type)
            ? {
                  verification:
                      await this.deps.aiServiceAccountCredentialsModel.getVerification(
                          projectUuid,
                          warehouseConnectionUuid,
                          results?.identityUuid ?? null,
                      ),
              }
            : {};
        const resolver = new AiServiceAccountSlotResolver(this.deps);
        const input = { projectUuid, connection: warehouseConnectionUuid };
        const inherited = await resolver
            .resolveParent(input)
            .catch(async (error) => {
                if (!(error instanceof AiServiceAccountSlotResolutionError))
                    throw error;
                const metadata = await resolver.resolveParentMetadata(input);
                return metadata === null
                    ? null
                    : {
                          ...metadata,
                          slot: { slot: metadata.slot, secrets: null },
                      };
            });
        if (inherited === null)
            return {
                results,
                parent: null,
                credentialsReadable,
                ...verification,
            };
        const parentUuid = inherited.sourceProjectUuid;
        const canView = this.createAuditedAbility(account).can(
            'view',
            subject('Project', { organizationUuid, projectUuid: parentUuid }),
        );
        return {
            results,
            credentialsReadable,
            ...verification,
            parent: {
                credentialsReadable: inherited.slot.secrets !== null,
                projectUuid: parentUuid,
                projectName: canView
                    ? (await this.deps.projectModel.getSummary(parentUuid)).name
                    : null,
                identityUuid: inherited.slot.slot.identityUuid,
                principal:
                    inherited.slot.secrets?.type === WarehouseTypes.BIGQUERY
                        ? (inherited.slot.secrets.keyfileContents
                              .client_email ?? null)
                        : null,
                ...(verifiedWarehouseTypes.has(connection.type)
                    ? {
                          verification:
                              await this.deps.aiServiceAccountCredentialsModel.getVerification(
                                  parentUuid,
                                  inherited.sourceConnection,
                                  inherited.slot.slot.identityUuid,
                              ),
                      }
                    : {}),
            },
        };
    }

    async upsert(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        input: AiServiceAccountCredentialInput,
    ): Promise<Omit<ApiAiServiceAccountSaveResponse, 'status'>> {
        await assertHumanManagedMutation({
            organizationUuid: account.organization.organizationUuid,
            ability: account.user.ability,
            oauth: account.authentication.type === 'oauth',
            database: this.deps.aiServiceAccountCredentialsModel.db,
            featureFlagModel: this.deps.featureFlagModel,
        });
        const {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        } = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            true,
        );
        if (input.type !== connection.type)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        const saved =
            await this.deps.aiServiceAccountCredentialsModel.getReplaceableSecrets(
                projectUuid,
                warehouseConnectionUuid,
            );
        const merged = mergeAiServiceAccountCredentials(input, saved);
        const { stored: credentials } =
            await aiServiceAccountCredentialResolvers.validateOnSave(
                {
                    connection,
                    stored: merged,
                    owner: null,
                    context: connectionContextFromAccount(account, {
                        organizationUuid,
                        queryContext: QueryExecutionContext.API,
                    }),
                    projectUuid,
                    warehouseConnectionUuid,
                    credentialKind: WarehouseCredentialKind.AI_SERVICE_ACCOUNT,
                    aiPlan: null,
                    intent: { kind: 'preserve' },
                },
                'ai_service_account',
            );
        const previous =
            await this.deps.aiServiceAccountCredentialsModel.getSlot(
                projectUuid,
                warehouseConnectionUuid,
            );
        const verification = verifiedWarehouseTypes.has(connection.type)
            ? await this.testConnection(
                  account,
                  projectUuid,
                  {
                      connection,
                      warehouseConnectionUuid,
                      organizationUuid,
                      connectionName,
                  },
                  credentials,
              )
            : null;
        if (verification !== null && !verification.ok)
            throw new ParameterError(verification.message);
        const slot = await this.deps.aiServiceAccountCredentialsModel.upsert(
            projectUuid,
            warehouseConnectionUuid,
            credentials,
            account.user.id,
            ...(verification === null ? [] : [verification]),
        );
        this.recordChange(
            account,
            previous === null ? 'create' : 'update',
            projectUuid,
            organizationUuid,
            {
                event: 'agent_identity.service_account_saved',
                warehouseConnectionUuid,
                connectionName,
                previousGeneration: previous?.identityUuid ?? null,
                generation: slot.identityUuid,
                inheritedFromProjectUuid: null,
                result: null,
            },
        );
        trackSafely(() =>
            this.deps.analytics.track({
                event: 'agent_identity.service_account_saved',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    userId: account.user.id,
                    warehouseType: connection.type,
                    operation: previous === null ? 'created' : 'updated',
                },
            }),
        );
        return {
            results: slot,
            ...(verifiedWarehouseTypes.has(connection.type)
                ? { verification }
                : {}),
        };
    }

    async delete(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
    ): Promise<void> {
        await assertHumanManagedMutation({
            organizationUuid: account.organization.organizationUuid,
            ability: account.user.ability,
            oauth: account.authentication.type === 'oauth',
            database: this.deps.aiServiceAccountCredentialsModel.db,
            featureFlagModel: this.deps.featureFlagModel,
        });
        const {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        } = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            true,
        );
        const previous =
            await this.deps.aiServiceAccountCredentialsModel.getSlot(
                projectUuid,
                warehouseConnectionUuid,
            );
        await this.deps.aiServiceAccountCredentialsModel.delete(
            projectUuid,
            warehouseConnectionUuid,
        );
        this.recordChange(account, 'delete', projectUuid, organizationUuid, {
            event: 'agent_identity.service_account_deleted',
            warehouseConnectionUuid,
            connectionName,
            previousGeneration: previous?.identityUuid ?? null,
            generation: null,
            inheritedFromProjectUuid: null,
            result: null,
        });
        trackSafely(() =>
            this.deps.analytics.track({
                event: 'agent_identity.service_account_deleted',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    userId: account.user.id,
                    warehouseType: connection.type,
                },
            }),
        );
    }

    async test(
        account: Account,
        projectUuid: string,
        connectionUuid: string | null,
        input: AiServiceAccountCredentialInput | null,
    ): Promise<AiServiceAccountTestResult> {
        const loaded = await this.loadConnection(
            account,
            projectUuid,
            connectionUuid,
            true,
        );
        if (input !== null && input.type !== loaded.connection.type)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        const secrets =
            input === null
                ? null
                : mergeAiServiceAccountCredentials(
                      input,
                      await this.deps.aiServiceAccountCredentialsModel.getReplaceableSecrets(
                          projectUuid,
                          loaded.warehouseConnectionUuid,
                      ),
                  );
        return this.testConnection(account, projectUuid, loaded, secrets);
    }

    private async probeConnection(
        account: Account,
        projectUuid: string,
        organizationUuid: string,
        connection: CreateWarehouseCredentials,
        secrets: AiServiceAccountSecrets,
        onQuery: () => void,
    ): Promise<AiServiceAccountTestResult> {
        const databricks = connection.type === WarehouseTypes.DATABRICKS;
        const snowflake = connection.type === WarehouseTypes.SNOWFLAKE;
        const context = connectionContextFromAccount(account, {
            organizationUuid,
            queryContext: QueryExecutionContext.API,
        });
        const credentials = databricks
            ? await resolveAiServiceAccountCredentials({
                  connection,
                  stored: secrets,
                  owner: null,
                  context,
                  projectUuid,
                  warehouseConnectionUuid: null,
              })
            : buildAiServiceAccountCredentials(connection, secrets);
        let principalArn: string | null = null;
        if (credentials.type === WarehouseTypes.ATHENA) {
            if (!credentials.accessKeyId || !credentials.secretAccessKey)
                throw new ParameterError('Provide complete AWS access keys.');
            const sts = new STSClient({
                region: credentials.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    ...(credentials.sessionToken
                        ? { sessionToken: credentials.sessionToken }
                        : {}),
                },
            });
            try {
                const identity = await sts.send(
                    new GetCallerIdentityCommand({}),
                );
                if (!identity.Arn?.trim())
                    throw new ParameterError(
                        'AWS did not return the caller identity.',
                    );
                principalArn = identity.Arn;
            } finally {
                sts.destroy();
            }
        }
        const { rows } =
            await this.deps.projectService.warehouseClientFactory.withWarehouseClient(
                {
                    kind: 'bypass',
                    mode: 'connection_test',
                    agentSession: true,
                    projectUuid,
                    credentials,
                    ...(databricks ||
                    snowflake ||
                    connection.type === WarehouseTypes.REDSHIFT ||
                    connection.type === WarehouseTypes.CLICKHOUSE
                        ? { clientOptions: { agentJobControls: true } }
                        : {}),
                },
                context,
                ({ warehouseClient }) => {
                    onQuery();
                    const query = (() => {
                        switch (connection.type) {
                            case WarehouseTypes.DATABRICKS:
                                return 'SELECT current_user() AS principal';
                            case WarehouseTypes.SNOWFLAKE:
                                return 'SELECT CURRENT_USER() AS "user", CURRENT_ROLE() AS "role"';
                            case WarehouseTypes.ATHENA:
                                return 'SELECT 1 AS connection_check';
                            case WarehouseTypes.TRINO:
                                return 'SELECT current_user AS principal';
                            case WarehouseTypes.REDSHIFT:
                            case WarehouseTypes.POSTGRES:
                                return 'SELECT current_user AS principal, session_user AS session_principal';
                            case WarehouseTypes.CLICKHOUSE:
                                return "SELECT\n  currentUser() AS principal,\n  getSetting('readonly') AS readonly,\n  getSetting('use_query_cache') AS use_query_cache";
                            case WarehouseTypes.BIGQUERY:
                            case WarehouseTypes.DUCKDB:
                                return 'SELECT SESSION_USER() AS principal';
                            default:
                                return assertUnreachable(
                                    connection,
                                    'Unknown warehouse type',
                                );
                        }
                    })();
                    return connection.type === WarehouseTypes.CLICKHOUSE
                        ? warehouseClient.runQuery(
                              query,
                              { agent: 'true' },
                              connection.dataTimezone ?? 'UTC',
                          )
                        : warehouseClient.runQuery(query, {});
                },
            );
        const row = Object.fromEntries(
            Object.entries(rows[0] ?? {}).map(([key, value]) => [
                key.toLowerCase(),
                value,
            ]),
        );
        if (
            connection.type === WarehouseTypes.ATHENA &&
            row.connection_check !== 1 &&
            row.connection_check !== '1'
        )
            throw new ParameterError(
                'The query did not return the connection check.',
            );
        const observedUser: unknown = snowflake ? row.user : row.principal;
        const principalValue: unknown =
            connection.type === WarehouseTypes.ATHENA
                ? principalArn
                : observedUser;
        const principal =
            typeof principalValue === 'string' ? principalValue : null;
        const role = typeof row.role === 'string' ? row.role : null;
        if (snowflake && (!principal?.trim() || !role?.trim()))
            throw new ParameterError(
                'The session did not return its current user and role.',
            );
        if (
            (databricks || connection.type === WarehouseTypes.TRINO) &&
            !principal?.trim()
        )
            throw new ParameterError(
                'The session did not return its current user.',
            );
        if (credentials.type === WarehouseTypes.CLICKHOUSE) {
            const readonly: unknown = row.readonly;
            const useQueryCache: unknown = row.use_query_cache;
            const message = (() => {
                if (
                    !principal?.trim() ||
                    !(
                        readonly === 0 ||
                        readonly === 1 ||
                        readonly === 2 ||
                        readonly === '0' ||
                        readonly === '1' ||
                        readonly === '2'
                    ) ||
                    !(
                        useQueryCache === false ||
                        useQueryCache === true ||
                        useQueryCache === 0 ||
                        useQueryCache === 1 ||
                        useQueryCache === '0' ||
                        useQueryCache === '1'
                    )
                )
                    return 'ClickHouse did not return its current user and read-only settings.';
                if (principal !== credentials.user)
                    return 'ClickHouse signed in as a different user.';
                if (readonly === 0 || readonly === '0')
                    return 'This ClickHouse user is not read-only. Set readonly to 2 before using it for agents.';
                if (
                    useQueryCache !== false &&
                    useQueryCache !== 0 &&
                    useQueryCache !== '0'
                )
                    return 'The ClickHouse query cache is enabled for this connection check.';
                return null;
            })();
            if (message !== null)
                return {
                    ok: false,
                    principal: null,
                    observed: {},
                    message,
                    checkedAt: new Date(),
                };
        }
        if (
            credentials.type === WarehouseTypes.POSTGRES &&
            (principal !== credentials.user ||
                row.session_principal !== credentials.user)
        ) {
            return {
                ok: false,
                principal: null,
                observed: {},
                message: 'Postgres signed in as a different user.',
                checkedAt: new Date(),
            };
        }
        if (
            credentials.type === WarehouseTypes.REDSHIFT &&
            (!principal?.trim() ||
                principal !== row.session_principal ||
                (principal !== credentials.user &&
                    principal !== credentials.user.toLowerCase()))
        ) {
            return {
                ok: false,
                principal: null,
                observed: {},
                message: 'Redshift signed in as a different user.',
                checkedAt: new Date(),
            };
        }
        return {
            ok: true,
            principal,
            observed: ((): AiServiceAccountTestResult['observed'] => {
                switch (connection.type) {
                    case WarehouseTypes.CLICKHOUSE:
                        return {
                            currentUser: principal,
                            readonly: String(row.readonly),
                            useQueryCache: '0',
                        };
                    case WarehouseTypes.SNOWFLAKE:
                        return { currentUser: principal, currentRole: role };
                    case WarehouseTypes.TRINO:
                    case WarehouseTypes.REDSHIFT:
                    case WarehouseTypes.POSTGRES:
                    case WarehouseTypes.DATABRICKS:
                        return { currentUser: principal };
                    case WarehouseTypes.ATHENA:
                        return { principalArn: principal };
                    case WarehouseTypes.BIGQUERY:
                    case WarehouseTypes.DUCKDB:
                        return { principal };
                    default:
                        return assertUnreachable(
                            connection,
                            'Unknown warehouse type',
                        );
                }
            })(),
            message:
                principal === null
                    ? 'Connection checked; principal not observed.'
                    : 'AI service account connection checked.',
            checkedAt: new Date(),
        };
    }

    private async testConnection(
        account: Account,
        projectUuid: string,
        loaded: Awaited<ReturnType<AiServiceAccountService['loadConnection']>>,
        input: AiServiceAccountSecrets | null,
    ): Promise<AiServiceAccountTestResult> {
        const {
            connection,
            warehouseConnectionUuid,
            organizationUuid,
            connectionName,
        } = loaded;
        let secrets = input;
        const slot = await this.deps.aiServiceAccountCredentialsModel.getSlot(
            projectUuid,
            warehouseConnectionUuid,
        );
        let sourceProjectUuid = projectUuid;
        let sourceConnection = warehouseConnectionUuid;
        let queryStarted = false;
        let inheritedFromProjectUuid: string | null = null;
        let testedGeneration =
            input === null ? null : (slot?.identityUuid ?? null);
        let result: AiServiceAccountTestResult;
        let failureReason: 'connection_failed' | 'query_failed' | null = null;
        try {
            if (input === null) {
                const resolved = await new AiServiceAccountSlotResolver(
                    this.deps,
                ).resolve({ projectUuid, connection: warehouseConnectionUuid });
                secrets = resolved?.slot.secrets ?? null;
                sourceProjectUuid = resolved?.sourceProjectUuid ?? projectUuid;
                sourceConnection = resolved
                    ? resolved.sourceConnection
                    : warehouseConnectionUuid;
                testedGeneration = resolved?.slot.slot.identityUuid ?? null;
                inheritedFromProjectUuid = resolved?.inherited
                    ? resolved.sourceProjectUuid
                    : null;
            }
            if (secrets === null) {
                throw new NotFoundError(
                    'The connection has no AI service account.',
                );
            }
            result = await this.probeConnection(
                account,
                projectUuid,
                organizationUuid,
                connection,
                secrets,
                () => {
                    queryStarted = true;
                },
            );
            if (!result.ok) failureReason = 'query_failed';
            if (
                result.ok &&
                input === null &&
                verifiedWarehouseTypes.has(connection.type) &&
                testedGeneration !== null
            ) {
                await this.deps.aiServiceAccountCredentialsModel.updateVerification(
                    sourceProjectUuid,
                    sourceConnection,
                    testedGeneration,
                    result,
                );
            }
        } catch (error) {
            if (error instanceof AiServiceAccountSlotResolutionError)
                inheritedFromProjectUuid = error.inheritedFromProjectUuid;
            if (secrets === null && error instanceof NotFoundError) throw error;
            failureReason = queryStarted ? 'query_failed' : 'connection_failed';
            this.logger.warn('AI service account test failed', {
                userUuid: account.user.id,
                organizationUuid,
                projectUuid,
                warehouseConnectionUuid,
                reason: failureReason,
                ...redactCredentialError(error),
                ...(connection.type === WarehouseTypes.POSTGRES ||
                connection.type === WarehouseTypes.REDSHIFT ||
                connection.type === WarehouseTypes.TRINO ||
                connection.type === WarehouseTypes.CLICKHOUSE
                    ? {
                          errorMessage:
                              getUserPasswordServiceAccountTestErrorMessage(
                                  connection.type,
                                  error,
                              ),
                      }
                    : {}),
            });
            result = {
                ok: false,
                principal: null,
                observed: {},
                message: (() => {
                    switch (connection.type) {
                        case WarehouseTypes.TRINO:
                        case WarehouseTypes.CLICKHOUSE:
                        case WarehouseTypes.REDSHIFT:
                        case WarehouseTypes.POSTGRES:
                            return getUserPasswordServiceAccountTestErrorMessage(
                                connection.type,
                                error,
                            );
                        case WarehouseTypes.ATHENA:
                            return getAthenaServiceAccountTestErrorMessage(
                                error,
                            );
                        default:
                            return 'Could not verify the AI service account. Check the credentials and connection settings.';
                    }
                })(),
                checkedAt: new Date(),
            };
        }
        this.recordChange(account, 'test', projectUuid, organizationUuid, {
            event: 'agent_identity.service_account_tested',
            warehouseConnectionUuid,
            connectionName,
            previousGeneration: testedGeneration,
            generation: testedGeneration,
            inheritedFromProjectUuid,
            result: result.ok ? 'success' : 'failure',
        });
        trackSafely(() =>
            this.deps.analytics.track({
                event: 'agent_identity.service_account_tested',
                userId: account.user.id,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    userId: account.user.id,
                    warehouseType: connection.type,
                    result: result.ok ? 'success' : 'failure',
                    failureReason,
                    credentialSource: input === null ? 'saved' : 'submitted',
                    inheritedFromProjectUuid,
                },
            }),
        );
        return result;
    }
}
