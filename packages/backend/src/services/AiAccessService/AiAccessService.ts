import {
    AI_PRINCIPAL_QUERY_TAG,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiPrincipalKind,
    AiPrincipalStatus,
    AiTransportKind,
    assertUnreachable,
    FeatureFlags,
    isAiAccessQueryContext,
    UnexpectedServerError,
    type AiAccessForUser,
    type AiAccessPolicy,
    type AiExecutionPlan,
    type AiPrincipalWithSecrets,
    type CreateWarehouseCredentials,
    type QueryExecutionContext,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AiPrincipalModel } from '../../models/AiPrincipalModel/AiPrincipalModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import { type AiCredentialProvider } from './providers/AiCredentialProvider';
import {
    getAiCredentialProvider,
    type AiCredentialProviderRegistry,
} from './providers/registry';

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
    userModel: UserModel;
    providerRegistry?: AiCredentialProviderRegistry;
};

export class AiAccessService extends BaseService {
    private readonly aiPrincipalModel: AiPrincipalModel;

    private readonly groupsModel: GroupsModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly userModel: UserModel;

    private readonly providerRegistry: AiCredentialProviderRegistry;

    constructor({
        aiPrincipalModel,
        groupsModel,
        featureFlagModel,
        userModel,
        providerRegistry = getAiCredentialProvider,
    }: AiAccessServiceArguments) {
        super();
        this.aiPrincipalModel = aiPrincipalModel;
        this.groupsModel = groupsModel;
        this.featureFlagModel = featureFlagModel;
        this.userModel = userModel;
        this.providerRegistry = providerRegistry;
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
            const principal = await this.principal(args, policy, email);
            AiAccessService.assertPrincipal(principal);
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
            await this.provider(args, policy);
            const { email } = await this.userModel.getUserDetailsByUuid(
                args.userUuid,
            );
            if (!email)
                throw new UnexpectedServerError(
                    'AI access needs the person to have an email address',
                );
            const principal = await this.principal(args, policy, email);
            result.principal = {
                aiPrincipalUuid: principal.aiPrincipalUuid,
                ref: principal.ref,
                status: principal.status,
            };
            AiAccessService.assertPrincipal(principal);
        } catch (error) {
            if (!(error instanceof AiAccessRefusedError)) throw error;
            this.logRefusal(args, policy, error);
            result.refusal = error.refusal;
        }
        return result;
    }
}
