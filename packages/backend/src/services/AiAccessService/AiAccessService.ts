import { subject } from '@casl/ability';
import {
    AI_PRINCIPAL_QUERY_TAG,
    AiAccessRefusalReason,
    AiAccessRefusedError,
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
    type Account,
    type AiAccessForUser,
    type AiAccessPolicy,
    type AiExecutionPlan,
    type AiPrincipal,
    type AiPrincipalWithSecrets,
    type AiSetupScript,
    type AiWarehouseCapabilities,
    type ApiAiQueryAuditResponse,
    type CreateWarehouseCredentials,
    type QueryExecutionContext,
    type UpsertAiAccessPolicy,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AiPrincipalModel } from '../../models/AiPrincipalModel/AiPrincipalModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { type WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { BaseService } from '../BaseService';
import {
    type AiCredentialProvider,
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

type AccessArgs = Omit<ResolvePlanArgs, 'context'>;

type AiAccessServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    aiPrincipalModel: AiPrincipalModel;
    groupsModel: GroupsModel;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    warehouseConnectionModel: WarehouseConnectionModel;
    userModel: UserModel;
    providerRegistry: AiCredentialProviderRegistry;
};

export class AiAccessService extends BaseService {
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
        action: 'view' | 'update',
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
        action: 'view' | 'update' = 'update',
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
                ? await this.projectModel.getWarehouseCredentialsForProject(
                      projectUuid,
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
        return this.providerRegistry(connection.type).capabilities(connection);
    }

    async getPolicy(
        account: Account,
        projectUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<AiAccessPolicy | null> {
        await this.authorizeProject(account, projectUuid, 'update');
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
        await this.authorizeProject(account, projectUuid, 'update');
        const principal =
            await this.aiPrincipalModel.getPrincipal(aiPrincipalUuid);
        const policy = await this.aiPrincipalModel.getPolicy(
            principal.aiAccessPolicyUuid,
        );
        if (policy.projectUuid !== projectUuid)
            throw new NotFoundError('AI principal not found');
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
            return this.aiPrincipalModel.recordProbe(aiPrincipalUuid, {
                ok: false,
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
        await this.aiPrincipalModel.setSecret(aiPrincipalUuid, secret);
        return this.aiPrincipalModel.resetStatus(aiPrincipalUuid);
    }

    async deletePrincipal(
        account: Account,
        aiPrincipalUuid: string,
    ): Promise<void> {
        await this.loadPrincipal(account, aiPrincipalUuid);
        await this.aiPrincipalModel.deletePrincipal(aiPrincipalUuid);
    }

    async listAudit(
        account: Account,
        projectUuid: string,
        args: { page: number; pageSize: number },
    ): Promise<ApiAiQueryAuditResponse['results']> {
        await this.authorizeProject(account, projectUuid, 'update');
        return this.aiPrincipalModel.listAudit(projectUuid, args);
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

    async recordQuery({
        queryUuid,
        projectUuid,
        warehouseConnectionUuid,
        plan,
    }: {
        queryUuid: string;
        projectUuid: string;
        warehouseConnectionUuid: string | null;
        plan: AiExecutionPlan;
    }): Promise<void> {
        await this.aiPrincipalModel.insertAudit({
            queryUuid,
            projectUuid,
            warehouseConnectionUuid,
            userUuid: plan.audit.personUuid,
            aiPrincipalUuid: plan.principal.aiPrincipalUuid,
            principalKind: plan.principal.kind,
            principalRef: plan.principal.ref,
            transport: plan.transport,
            probeOk: plan.principal.lastProbe?.ok ?? false,
            probeCheckedAt: plan.principal.lastProbe?.checkedAt ?? null,
            personTag: plan.audit.personUuid,
        });
    }

    private async enabledPolicy(
        args: AccessArgs,
    ): Promise<AiAccessPolicy | null> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: args.userUuid,
                organizationUuid: args.organizationUuid,
            },
            featureFlagId: FeatureFlags.AiPrincipals,
        });
        if (!enabled) return null;
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
        if (args.isServiceAccount || !args.isRegisteredUser) {
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.SERVICE_ACCOUNT,
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
                { message: principal.statusMessage ?? undefined },
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

    async resolvePlan(args: ResolvePlanArgs): Promise<AiExecutionPlan | null> {
        if (!isAiAccessQueryContext(args.context)) return null;
        const policy = await this.enabledPolicy(args);
        if (!policy) return null;
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
            const { credentials, assurances } = await provider.mint({
                connection: args.connection,
                principal,
                policy,
                person: { userUuid: args.userUuid, email },
            });
            let verifiedPrincipal = principal;
            if (
                principal.status === AiPrincipalStatus.PENDING ||
                !principal.lastProbe ||
                Date.now() - principal.lastProbe.checkedAt.getTime() >
                    60 * 60 * 1000
            ) {
                const probe = await provider.probe(credentials, assurances);
                const recorded = await this.aiPrincipalModel.recordProbe(
                    principal.aiPrincipalUuid,
                    probe,
                );
                if (!probe.ok)
                    throw new AiAccessRefusedError(
                        AiAccessRefusalReason.PRINCIPAL_FAILED,
                        { message: probe.message },
                    );
                verifiedPrincipal = {
                    ...recorded,
                    secret: principal.secret,
                };
            }
            const { secret, ...publicPrincipal } = verifiedPrincipal;
            return {
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
        const policy = await this.enabledPolicy(args);
        const result: AiAccessForUser = {
            projectUuid: args.projectUuid,
            warehouseConnectionUuid: args.warehouseConnectionUuid,
            enabled: policy !== null,
            principalKind: policy?.principalKind ?? null,
            principal: null,
            refusal: null,
        };
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
