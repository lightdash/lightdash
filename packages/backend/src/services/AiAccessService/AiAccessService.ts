import { subject } from '@casl/ability';
import {
    AI_AGENT_APPLICATION_NAME,
    AI_AGENT_TAG,
    AI_PRINCIPAL_QUERY_TAG,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiAgentMarkerLevel,
    AiCredentialMethod,
    AiPrincipalFailureReason,
    AiPrincipalKind,
    AiPrincipalStatus,
    AiTransportKind,
    assertIsAccountWithOrg,
    assertUnreachable,
    FeatureFlags,
    ForbiddenError,
    isAiAccessQueryContext,
    NotFoundError,
    ParameterError,
    UnexpectedServerError,
    WarehouseTypes,
    type Account,
    type AiAccessForUser,
    type AiAccessPolicy,
    type AiExecutionPlan,
    type AiMarkerTestResult,
    type AiPrincipal,
    type AiPrincipalWithSecrets,
    type AiSetupScript,
    type AiWarehouseCapabilities,
    type CreateWarehouseCredentials,
    type QueryExecutionContext,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AiPrincipalModel } from '../../models/AiPrincipalModel/AiPrincipalModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import { describeAgentMarker } from './agentMarker';
import { agentMarkerProbe } from './agentMarkerProbe';
import {
    type AiCredentialProvider,
    type AiMintArgs,
    type AiMintedCredentials,
} from './providers/AiCredentialProvider';
import { type AiCredentialProviderRegistry } from './providers/registry';

export type ResolvePlanArgs = {
    projectUuid: string;
    organizationUuid: string;
    warehouseConnectionUuid: string | null;
    connection: CreateWarehouseCredentials;
    context: QueryExecutionContext;
    userUuid: string;
    isRegisteredUser: boolean;
    isServiceAccount: boolean;
};

type AiMintCacheEntry = {
    minted: AiMintedCredentials<CreateWarehouseCredentials> | null;
    expiresAt: Date;
    pending: Promise<AiMintedCredentials<CreateWarehouseCredentials>> | null;
};

type AccessArgs = Omit<ResolvePlanArgs, 'context'>;

type PolicyLookupArgs = Pick<
    AccessArgs,
    'projectUuid' | 'organizationUuid' | 'warehouseConnectionUuid' | 'userUuid'
>;

type AiAccessServiceArguments = {
    lightdashConfig: LightdashConfig;
    aiPrincipalModel: AiPrincipalModel;
    groupsModel: GroupsModel;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    warehouseConnectionModel: WarehouseConnectionModel;
    userModel: UserModel;
    providerRegistry: AiCredentialProviderRegistry;
};

export class AiAccessService extends BaseService {
    private readonly mintCache = new Map<string, AiMintCacheEntry>();

    invalidateCredentials(aiPrincipalUuid: string): void {
        this.mintCache.delete(aiPrincipalUuid);
    }

    private async mintCredentials(
        provider: AiCredentialProvider,
        args: AiMintArgs<CreateWarehouseCredentials>,
    ): Promise<AiMintedCredentials<CreateWarehouseCredentials>> {
        const key = args.principal.aiPrincipalUuid;
        const cached = this.mintCache.get(key);
        if (cached?.pending) return cached.pending;
        if (cached?.minted && cached.expiresAt.getTime() > Date.now())
            return cached.minted;
        const entry: AiMintCacheEntry = {
            minted: null,
            expiresAt: new Date(0),
            pending: null,
        };
        this.mintCache.set(key, entry);
        entry.pending = provider
            .mint(args)
            .then((minted) => {
                if (this.mintCache.get(key) === entry) {
                    if (minted.expiresAt === null) this.mintCache.delete(key);
                    else {
                        entry.minted = minted;
                        entry.expiresAt = minted.expiresAt;
                        entry.pending = null;
                    }
                }
                return minted;
            })
            .catch((error: unknown) => {
                if (this.mintCache.get(key) === entry)
                    this.mintCache.delete(key);
                throw error;
            });
        return entry.pending;
    }

    private readonly aiPrincipalModel: AiPrincipalModel;

    private readonly groupsModel: GroupsModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly projectModel: ProjectModel;

    private readonly warehouseConnectionModel: WarehouseConnectionModel;

    private readonly userModel: UserModel;

    private readonly providerRegistry: AiCredentialProviderRegistry;

    constructor({
        aiPrincipalModel,
        groupsModel,
        featureFlagModel,
        userModel,
        projectModel,
        warehouseConnectionModel,
        providerRegistry,
    }: AiAccessServiceArguments) {
        super();
        this.aiPrincipalModel = aiPrincipalModel;
        this.groupsModel = groupsModel;
        this.featureFlagModel = featureFlagModel;
        this.userModel = userModel;
        this.projectModel = projectModel;
        this.warehouseConnectionModel = warehouseConnectionModel;
        this.providerRegistry = providerRegistry;
    }

    private async authorizeProject(
        account: Account,
        projectUuid: string,
        action: 'view' | 'manage',
    ): Promise<string> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                action,
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    private async loadConnection(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        action: 'view' | 'manage' = 'manage',
    ): Promise<{
        connection: CreateWarehouseCredentials;
        organizationUuid: string;
    }> {
        const organizationUuid = await this.authorizeProject(
            account,
            projectUuid,
            action,
        );
        const connection =
            warehouseConnectionUuid === null
                ? await this.projectModel.getWarehouseCredentialsForBinding(
                      projectUuid,
                      { kind: 'connection', warehouseConnectionUuid: null },
                  )
                : await this.warehouseConnectionModel.getCredentials(
                      await this.warehouseConnectionModel.getProject(
                          projectUuid,
                      ),
                      warehouseConnectionUuid,
                  );
        return { connection, organizationUuid };
    }

    async getCapabilities(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiWarehouseCapabilities> {
        const { connection } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
        );
        return {
            ...this.providerRegistry(connection.type).capabilities(connection),
            marker: describeAgentMarker(connection.type),
        };
    }

    async getPolicy(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiAccessPolicy | null> {
        await this.authorizeProject(account, projectUuid, 'manage');
        return this.aiPrincipalModel.findPolicy(
            projectUuid,
            warehouseConnectionUuid,
        );
    }

    async upsertPolicy(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        upsert: UpsertAiAccessPolicy,
    ): Promise<AiAccessPolicy> {
        const { connection, organizationUuid } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
        );
        const provider = this.providerRegistry(connection.type);
        const capabilities = provider.capabilities(connection);
        const kind = capabilities.principals[upsert.principalKind];
        if (!kind.available) throw new ParameterError(kind.reason);
        const transport = capabilities.transports[upsert.transport.kind];
        if (!transport.available) throw new ParameterError(transport.reason);
        switch (upsert.principalKind) {
            case AiPrincipalKind.SHARED:
                if (!upsert.sharedRef?.trim())
                    throw new ParameterError(
                        'A shared principal needs a reference.',
                    );
                break;
            case AiPrincipalKind.TWIN:
                if (!upsert.twinNameTemplate?.trim())
                    throw new ParameterError(
                        'A twin principal needs a name template.',
                    );
                break;
            case AiPrincipalKind.GROUP:
                if (upsert.groupMappings.length === 0)
                    throw new ParameterError(
                        'A group policy needs at least one mapping.',
                    );
                break;
            case AiPrincipalKind.PERSON:
                break;
            default:
                assertUnreachable(
                    upsert.principalKind,
                    'Unknown AI principal kind',
                );
        }
        const refs = new Set<string>();
        for (const mapping of upsert.groupMappings) {
            if (!isValidUuid(mapping.groupUuid))
                throw new ParameterError('A group mapping needs a group.');
            if (!mapping.ref.trim())
                throw new ParameterError('A group mapping needs a reference.');
            if (refs.has(mapping.ref))
                throw new ParameterError(
                    'Group principal references must be unique.',
                );
            refs.add(mapping.ref);
        }
        await Promise.all(
            upsert.groupMappings.map(async (mapping) => {
                const group = await this.groupsModel.getGroup(
                    mapping.groupUuid,
                );
                if (group.organizationUuid !== organizationUuid) {
                    throw new ParameterError(
                        'The group must belong to the project organization.',
                    );
                }
            }),
        );
        const policy = await this.aiPrincipalModel.upsertPolicy(
            projectUuid,
            warehouseConnectionUuid,
            upsert,
        );
        let principals: { ref: string; groupUuid: string | null }[] = [];
        if (
            policy.principalKind === AiPrincipalKind.SHARED &&
            policy.sharedRef !== null
        ) {
            principals = [{ ref: policy.sharedRef, groupUuid: null }];
        } else if (policy.principalKind === AiPrincipalKind.GROUP) {
            principals = policy.groupMappings;
        }
        const desired = new Map(principals.map((entry) => [entry.ref, entry]));
        const staticKind =
            policy.principalKind === AiPrincipalKind.SHARED ||
            policy.principalKind === AiPrincipalKind.GROUP;
        const existing = await this.aiPrincipalModel.listPrincipals(
            policy.aiAccessPolicyUuid,
        );
        await Promise.all(
            existing
                .filter(
                    (principal) =>
                        principal.kind !== policy.principalKind ||
                        (staticKind &&
                            desired.get(principal.ref)?.groupUuid !==
                                principal.groupUuid),
                )
                .map((principal) =>
                    this.aiPrincipalModel.deletePrincipal(
                        principal.aiPrincipalUuid,
                    ),
                ),
        );
        await Promise.all(
            principals.map(async (entry) => {
                const created = await this.aiPrincipalModel.createPrincipal({
                    aiAccessPolicyUuid: policy.aiAccessPolicyUuid,
                    kind: policy.principalKind,
                    ref: entry.ref,
                    userUuid: null,
                    groupUuid: entry.groupUuid,
                });
                await this.ensureSecret(
                    await this.aiPrincipalModel.getPrincipal(
                        created.aiPrincipalUuid,
                    ),
                    provider,
                );
            }),
        );
        return policy;
    }

    async listPrincipals(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiPrincipal[]> {
        const policy = await this.getPolicy(
            account,
            projectUuid,
            warehouseConnectionUuid,
        );
        return policy === null
            ? []
            : this.aiPrincipalModel.listPrincipals(policy.aiAccessPolicyUuid);
    }

    async getSetupScript(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        aiPrincipalUuid: string | null,
    ): Promise<AiSetupScript> {
        const { connection } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
        );
        const policy = await this.aiPrincipalModel.findPolicy(
            projectUuid,
            warehouseConnectionUuid,
        );
        if (policy === null)
            throw new NotFoundError('AI access policy not found');
        const provider = this.providerRegistry(connection.type);
        let principal =
            aiPrincipalUuid === null
                ? null
                : await this.aiPrincipalModel.getPrincipal(aiPrincipalUuid);
        if (principal !== null) {
            if (principal.aiAccessPolicyUuid !== policy.aiAccessPolicyUuid)
                throw new NotFoundError('AI principal not found');
            principal = await this.ensureSecret(principal, provider);
        }
        return provider.setupScript({ connection, policy, principal });
    }

    private async loadPrincipal(account: Account, aiPrincipalUuid: string) {
        assertIsAccountWithOrg(account);
        const principal =
            await this.aiPrincipalModel.getPrincipal(aiPrincipalUuid);
        const policy = await this.aiPrincipalModel.getPolicy(
            principal.aiAccessPolicyUuid,
        );
        const { connection } = await this.loadConnection(
            account,
            policy.projectUuid,
            policy.warehouseConnectionUuid,
        );
        return {
            principal,
            policy,
            connection,
            provider: this.providerRegistry(connection.type),
        };
    }

    async assertPrincipalProject(
        account: Account,
        projectUuid: string,
        aiPrincipalUuid: string,
    ): Promise<void> {
        await this.authorizeProject(account, projectUuid, 'manage');
        const principal =
            await this.aiPrincipalModel.getPrincipal(aiPrincipalUuid);
        const policy = await this.aiPrincipalModel.getPolicy(
            principal.aiAccessPolicyUuid,
        );
        if (policy.projectUuid !== projectUuid)
            throw new NotFoundError('AI principal not found');
    }

    async testMarker(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
        runQuery: (sql: string) => Promise<Record<string, unknown>[]>,
    ): Promise<AiMarkerTestResult> {
        const { connection } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
        );
        const marker = describeAgentMarker(connection.type);
        const result: AiMarkerTestResult = {
            ok: false,
            level: marker.level,
            observed: {},
            message: 'The agent marker check failed.',
            checkedAt: new Date(),
        };
        if (marker.level === AiAgentMarkerLevel.NONE) {
            return {
                ...result,
                message: 'This warehouse cannot mark agent queries.',
            };
        }
        try {
            const probe = agentMarkerProbe(connection.type);
            let rows: Record<string, unknown>[];
            try {
                rows = await runQuery(probe.sql);
            } catch (error) {
                if (
                    probe.fallbackSql === null ||
                    !(error instanceof Error) ||
                    !/unknown function.*CURRENT_QUERY_TAG|CURRENT_QUERY_TAG.*does not exist/i.test(
                        error.message,
                    )
                )
                    throw error;
                rows = await runQuery(probe.fallbackSql);
            }
            result.observed = Object.fromEntries(
                Object.entries(rows[0] ?? {}).map(([key, value]) => [
                    key.toLowerCase(),
                    value === null ? null : String(value),
                ]),
            );
            switch (connection.type) {
                case WarehouseTypes.POSTGRES:
                case WarehouseTypes.REDSHIFT:
                    result.ok =
                        result.observed.agent === 'true' &&
                        result.observed.application_name ===
                            AI_AGENT_APPLICATION_NAME;
                    break;
                case WarehouseTypes.SNOWFLAKE:
                    result.ok = result.observed.agent?.toLowerCase() === 'true';
                    break;
                case WarehouseTypes.DATABRICKS:
                case WarehouseTypes.BIGQUERY:
                case WarehouseTypes.ATHENA:
                case WarehouseTypes.CLICKHOUSE:
                case WarehouseTypes.TRINO:
                    result.ok = true;
                    result.observed = {
                        agent: 'true',
                        channels: marker.signals
                            .map((signal) => signal.name)
                            .join(', '),
                    };
                    break;
                case WarehouseTypes.DUCKDB:
                    break;
                default:
                    assertUnreachable(connection, 'Unknown warehouse type');
            }
            if (!result.ok) {
                result.message =
                    'The warehouse session did not report the expected agent marker.';
            } else if (marker.level === AiAgentMarkerLevel.REQUEST_BOUND) {
                result.message =
                    'The query carried the agent marker through the listed channels. Enforcement needs your access control plugin or policy to read it.';
            } else if (marker.level === AiAgentMarkerLevel.IDENTIFY_ONLY) {
                result.message =
                    'The query succeeded with agent tags sent through the listed channels. These tags identify queries; they do not enforce access.';
            } else {
                result.message =
                    'The warehouse session carries the agent marker.';
            }
        } catch {
            result.message =
                'The agent marker query failed. Check your warehouse credentials and connection.';
        }
        return { ...result, checkedAt: new Date() };
    }

    async testPrincipal(
        account: Account,
        aiPrincipalUuid: string,
    ): Promise<AiPrincipal> {
        const { principal, policy, connection, provider } =
            await this.loadPrincipal(account, aiPrincipalUuid);
        if (
            principal.userUuid !== null &&
            principal.userUuid !== account.user.id
        )
            throw new ForbiddenError(
                'Only the person can test their own AI principal.',
            );
        const withSecret = await this.ensureSecret(principal, provider);
        const { email } = await this.userModel.getUserDetailsByUuid(
            account.user.id,
        );
        if (!email)
            throw new UnexpectedServerError(
                'AI access needs the person to have an email address',
            );
        let minted: AiMintedCredentials<CreateWarehouseCredentials>;
        try {
            minted = await provider.mint({
                connection,
                principal: withSecret,
                policy,
                person: { userUuid: account.user.id, email },
            });
        } catch (error) {
            if (!(error instanceof AiAccessRefusedError)) throw error;
            this.invalidateCredentials(aiPrincipalUuid);
            return this.aiPrincipalModel.recordProbe(aiPrincipalUuid, {
                ok: false,
                transient: false,
                checkedAt: new Date(),
                reason: AiPrincipalFailureReason.CREDENTIAL_REJECTED,
                message: error.refusal.message,
                observed: {},
            });
        }
        const probe = await provider.probe(
            minted.credentials,
            minted.assurances,
        );
        if (!probe.ok) this.invalidateCredentials(aiPrincipalUuid);
        return this.aiPrincipalModel.recordProbe(aiPrincipalUuid, probe);
    }

    async regenerateSecret(
        account: Account,
        aiPrincipalUuid: string,
    ): Promise<AiPrincipal> {
        const { provider } = await this.loadPrincipal(account, aiPrincipalUuid);
        const secret = await provider.createSecret();
        if (secret === null)
            throw new ParameterError(
                'This warehouse mints credentials; there is no secret to regenerate.',
            );
        this.invalidateCredentials(aiPrincipalUuid);
        await this.aiPrincipalModel.setSecret(aiPrincipalUuid, secret);
        return this.aiPrincipalModel.resetStatus(aiPrincipalUuid);
    }

    async deletePrincipal(
        account: Account,
        aiPrincipalUuid: string,
    ): Promise<void> {
        await this.loadPrincipal(account, aiPrincipalUuid);
        this.invalidateCredentials(aiPrincipalUuid);
        await this.aiPrincipalModel.deletePrincipal(aiPrincipalUuid);
    }

    async getMyAccess(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiAccessForUser> {
        const { connection, organizationUuid } = await this.loadConnection(
            account,
            projectUuid,
            warehouseConnectionUuid,
            'view',
        );
        return this.getAiAccessForUser({
            projectUuid,
            warehouseConnectionUuid,
            organizationUuid,
            connection,
            userUuid: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        });
    }

    recordQuery({
        queryUuid,
        projectUuid,
        warehouseConnectionUuid,
        plan,
        context,
    }: {
        queryUuid: string;
        projectUuid: string;
        warehouseConnectionUuid: string | null;
        plan: AiExecutionPlan;
        context: QueryExecutionContext;
    }): void {
        this.logger.info('Agent query', {
            queryUuid,
            projectUuid,
            warehouseConnectionUuid,
            userUuid:
                plan.identity === 'marked_person'
                    ? plan.audit.userUuid
                    : plan.audit.personUuid,
            identity: plan.identity,
            principalKind:
                plan.identity === 'principal'
                    ? plan.principal.kind
                    : AiPrincipalKind.PERSON,
            principalRef: plan.audit.principalRef,
            transport: plan.transport,
            context,
        });
    }

    private async isEnabled(args: PolicyLookupArgs): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: args.userUuid,
                organizationUuid: args.organizationUuid,
            },
            featureFlagId: FeatureFlags.AiPrincipals,
        });
        return enabled;
    }

    private async enabledPolicy(
        args: PolicyLookupArgs,
    ): Promise<AiAccessPolicy | null> {
        if (!(await this.isEnabled(args))) return null;
        return this.findEnabledPolicy(args);
    }

    private async findEnabledPolicy(
        args: PolicyLookupArgs,
    ): Promise<AiAccessPolicy | null> {
        const policy = await this.aiPrincipalModel.findPolicy(
            args.projectUuid,
            args.warehouseConnectionUuid,
        );
        return policy?.enabled ? policy : null;
    }

    private async provider(
        args: AccessArgs,
        policy: AiAccessPolicy,
    ): Promise<AiCredentialProvider> {
        if (args.isServiceAccount) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.SERVICE_ACCOUNT,
            );
        }
        if (!args.isRegisteredUser) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.EMBED_NOT_SUPPORTED,
            );
        }
        const provider = this.providerRegistry(args.connection.type);
        const capabilities = provider.capabilities(args.connection);
        const principal = capabilities.principals[policy.principalKind];
        if (!principal.available) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                { message: principal.reason },
            );
        }
        const transport = capabilities.transports[policy.transport.kind];
        if (!transport.available) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.TRANSPORT_UNAVAILABLE,
                { message: transport.reason },
            );
        }
        if (policy.transport.kind === AiTransportKind.PROCEDURE) {
            const { enabled } = await this.featureFlagModel.get({
                user: {
                    userUuid: args.userUuid,
                    organizationUuid: args.organizationUuid,
                },
                featureFlagId: FeatureFlags.AiProcedureTransport,
            });
            if (!enabled)
                throw new AiAccessRefusedError(
                    AiAccessRefusalReason.TRANSPORT_UNAVAILABLE,
                );
        }
        return provider;
    }

    private async principal(
        args: AccessArgs,
        policy: AiAccessPolicy,
        email: string,
    ): Promise<AiPrincipalWithSecrets> {
        const { aiAccessPolicyUuid, principalKind } = policy;
        let ref: string;
        let userUuid: string | null = null;
        let groupUuid: string | null = null;
        switch (principalKind) {
            case AiPrincipalKind.SHARED:
                if (!policy.sharedRef)
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.NO_POLICY,
                    );
                ref = policy.sharedRef;
                break;
            case AiPrincipalKind.GROUP: {
                const groups = await this.groupsModel.findUserGroups({
                    userUuid: args.userUuid,
                    organizationUuid: args.organizationUuid,
                });
                const mapping = policy.groupMappings
                    .filter((m) => groups.some((g) => g.uuid === m.groupUuid))
                    .sort(
                        (a, b) =>
                            b.priority - a.priority ||
                            a.groupName.localeCompare(b.groupName),
                    )[0];
                if (!mapping)
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.NO_GROUP_MAPPING,
                    );
                ref = mapping.ref;
                groupUuid = mapping.groupUuid;
                break;
            }
            case AiPrincipalKind.TWIN:
            case AiPrincipalKind.PERSON: {
                userUuid = args.userUuid;
                const existing =
                    await this.aiPrincipalModel.findPrincipalForUser({
                        aiAccessPolicyUuid,
                        userUuid,
                    });
                if (existing) return existing;
                if (principalKind === AiPrincipalKind.PERSON) {
                    ref = userUuid;
                } else {
                    if (policy.twinNameTemplate === null)
                        throw new AiAccessRefusedError(
                            AiAccessRefusalReason.NO_POLICY,
                        );
                    ref = policy.twinNameTemplate
                        .replaceAll(
                            '{email_local_part}',
                            email.split('@')[0].replace(/[^A-Za-z0-9_]/g, '_'),
                        )
                        .replaceAll('{user_uuid}', userUuid);
                }
                break;
            }
            default:
                return assertUnreachable(
                    principalKind,
                    'Unknown AI principal kind',
                );
        }
        const existing = await this.aiPrincipalModel.findPrincipalByRef({
            aiAccessPolicyUuid,
            ref,
        });
        if (existing) return existing;
        const created = await this.aiPrincipalModel.createPrincipal({
            aiAccessPolicyUuid,
            kind: principalKind,
            ref,
            userUuid,
            groupUuid,
        });
        return this.aiPrincipalModel.getPrincipal(created.aiPrincipalUuid);
    }

    private static assertPrincipal(principal: AiPrincipalWithSecrets): void {
        if (principal.status === AiPrincipalStatus.FAILED) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.PRINCIPAL_FAILED,
            );
        }
    }

    private logRefusal(
        args: AccessArgs,
        policy: AiAccessPolicy,
        error: AiAccessRefusedError,
    ): void {
        this.logger.warn('AI access query refused', {
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: args.warehouseConnectionUuid,
            userUuid: args.userUuid,
            reason: error.refusal.reason,
            principalKind: policy.principalKind,
        });
    }

    private async ensureSecret(
        principal: AiPrincipalWithSecrets,
        provider: AiCredentialProvider,
    ): Promise<AiPrincipalWithSecrets> {
        if (principal.secret !== null) return principal;
        const created = await provider.createSecret();
        if (created === null) return principal;
        await this.aiPrincipalModel.setSecret(
            principal.aiPrincipalUuid,
            created,
        );
        return this.aiPrincipalModel.getPrincipal(principal.aiPrincipalUuid);
    }

    async isPolicyEnabled(args: PolicyLookupArgs): Promise<boolean> {
        const policy = await this.enabledPolicy(args);
        if (!policy) return false;
        if (policy.principalKind !== AiPrincipalKind.PERSON) return true;
        const connection =
            args.warehouseConnectionUuid === null
                ? await this.projectModel.getWarehouseCredentialsForBinding(
                      args.projectUuid,
                      { kind: 'connection', warehouseConnectionUuid: null },
                  )
                : await this.warehouseConnectionModel.getCredentials(
                      await this.warehouseConnectionModel.getProject(
                          args.projectUuid,
                      ),
                      args.warehouseConnectionUuid,
                  );
        return !this.usesMarker(connection);
    }

    private usesMarker(connection: CreateWarehouseCredentials): boolean {
        const { person } = this.providerRegistry(connection.type).capabilities(
            connection,
        ).principals;
        return person.available && person.method === AiCredentialMethod.MARKER;
    }

    async resolvePlan(args: ResolvePlanArgs): Promise<AiExecutionPlan | null> {
        if (
            !isAiAccessQueryContext(args.context) ||
            !(await this.isEnabled(args))
        )
            return null;
        const policy = await this.findEnabledPolicy(args);
        if (
            !policy ||
            (policy.principalKind === AiPrincipalKind.PERSON &&
                this.usesMarker(args.connection))
        ) {
            const email =
                args.isRegisteredUser && !args.isServiceAccount
                    ? (await this.userModel.getUserDetailsByUuid(args.userUuid))
                          .email
                    : null;
            return {
                identity: 'marked_person',
                transport: { kind: AiTransportKind.DIRECT },
                assurances: [
                    {
                        kind: 'agent_marker',
                        level: describeAgentMarker(args.connection.type).level,
                    },
                ],
                audit: {
                    personUuid: args.userUuid,
                    userUuid:
                        args.isRegisteredUser || args.isServiceAccount
                            ? args.userUuid
                            : null,
                    principalRef: email ?? args.userUuid,
                    queryTags: { [AI_AGENT_TAG]: 'true' },
                },
            };
        }
        try {
            const provider = await this.provider(args, policy);
            const { email } = await this.userModel.getUserDetailsByUuid(
                args.userUuid,
            );
            if (!email)
                throw new UnexpectedServerError(
                    'AI access needs the person to have an email address',
                );
            let principal = await this.principal(args, policy, email);
            AiAccessService.assertPrincipal(principal);
            principal = await this.ensureSecret(principal, provider);
            const { credentials, assurances } = await this.mintCredentials(
                provider,
                {
                    connection: args.connection,
                    principal,
                    policy,
                    person: { userUuid: args.userUuid, email },
                },
            );
            let verifiedPrincipal = principal;
            if (
                principal.status === AiPrincipalStatus.PENDING ||
                !principal.lastProbe?.ok ||
                Date.now() - principal.lastProbe.checkedAt.getTime() >
                    60 * 60 * 1000
            ) {
                const probe = await provider.probe(credentials, assurances);
                if (!probe.ok)
                    this.invalidateCredentials(principal.aiPrincipalUuid);
                const recorded = await this.aiPrincipalModel.recordProbe(
                    principal.aiPrincipalUuid,
                    probe,
                );
                if (!probe.ok) {
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.PRINCIPAL_FAILED,
                    );
                }
                verifiedPrincipal = {
                    ...recorded,
                    secret: principal.secret,
                };
            }
            const { secret, ...publicPrincipal } = verifiedPrincipal;
            return {
                identity: 'principal',
                principal: publicPrincipal,
                transport: policy.transport,
                credentials,
                assurances,
                audit: {
                    personUuid: args.userUuid,
                    principalRef: principal.ref,
                    queryTags: { [AI_PRINCIPAL_QUERY_TAG]: principal.ref },
                },
            };
        } catch (error) {
            if (error instanceof AiAccessRefusedError)
                this.logRefusal(args, policy, error);
            throw error;
        }
    }

    async getAiAccessForUser(args: AccessArgs): Promise<AiAccessForUser> {
        const enabled = await this.isEnabled(args);
        const policy = enabled ? await this.findEnabledPolicy(args) : null;
        const marked =
            enabled &&
            (!policy ||
                (policy.principalKind === AiPrincipalKind.PERSON &&
                    this.usesMarker(args.connection)));
        const result: AiAccessForUser = {
            identity: policy ? 'principal' : null,
            marker: enabled ? describeAgentMarker(args.connection.type) : null,
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: args.warehouseConnectionUuid,
            enabled,
            principalKind: marked
                ? AiPrincipalKind.PERSON
                : (policy?.principalKind ?? null),
            principal: null,
            refusal: null,
        };
        if (marked) return { ...result, identity: 'marked_person' };
        if (!policy) return result;
        try {
            const provider = await this.provider(args, policy);
            const { email } = await this.userModel.getUserDetailsByUuid(
                args.userUuid,
            );
            if (!email)
                throw new UnexpectedServerError(
                    'AI access needs the person to have an email address',
                );
            let principal = await this.principal(args, policy, email);
            AiAccessService.assertPrincipal(principal);
            principal = await this.ensureSecret(principal, provider);
            const missingPrerequisite = await provider.missingPrerequisite({
                connection: args.connection,
                principal,
                policy,
                person: { userUuid: args.userUuid, email },
            });
            if (missingPrerequisite !== null)
                throw new AiAccessRefusedError(missingPrerequisite);
            result.principal = {
                aiPrincipalUuid: principal.aiPrincipalUuid,
                ref: principal.ref,
                status: principal.status,
            };
        } catch (error) {
            if (!(error instanceof AiAccessRefusedError)) throw error;
            this.logRefusal(args, policy, error);
            result.refusal = error.refusal;
        }
        return result;
    }
}
