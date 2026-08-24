import {
    ForbiddenError,
    type RegisteredAccount,
    type SpaceMemberRole,
    type UUID,
} from '@lightdash/common';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import {
    type DirectAccess,
    type DirectAccessModel,
    type DirectAccessModelActorRoleResolver,
    type DirectAccessMutationContext,
    type DirectAccessMutationResult,
    type DirectAccessResetResult,
} from '../../models/directAccessModelUtils';
import { BaseService } from '../BaseService';
import {
    auditDirectAccessMutation,
    auditDirectAccessReset,
    type DirectAccessAuditLogger,
} from './directAccessAudit';
import { DirectAccessFeatureGate } from './DirectAccessFeatureGate';
import {
    getLogicalAccessBatch,
    resolveDirectAccessBatch,
    type DirectAccessResources,
} from './directAccessResolver';

export type DirectAccessResourceType =
    | 'dashboard'
    | 'savedChart'
    | 'savedSql'
    | 'app';

export type DirectAccessResource = {
    type: DirectAccessResourceType;
    uuid: UUID;
};

export type DirectAccessModels = Record<
    DirectAccessResourceType,
    DirectAccessModel
>;

const auditResourceTypes: Record<DirectAccessResourceType, string> = {
    dashboard: 'Dashboard',
    savedChart: 'SavedChart',
    savedSql: 'SavedSql',
    app: 'App',
};

type DirectAccessActorRoleResolverInput = {
    account: RegisteredAccount;
    organizationUuid: UUID;
    resource: DirectAccessResource;
} & (
    | { phase: 'preflight' }
    | {
          phase: 'transaction';
          transaction: Parameters<DirectAccessModelActorRoleResolver>[0]['transaction'];
          context: DirectAccessMutationContext;
      }
);

/**
 * `preflight` is an advisory, read-only check used to fail closed before any
 * target lookup. `transaction` is authoritative: it must lock every source
 * whose state could lower the returned role until the supplied transaction
 * completes. Authority based on an absent row requires a stable anchor lock
 * or an equivalent serialization mechanism.
 */
export type DirectAccessActorRoleResolver = (
    input: DirectAccessActorRoleResolverInput,
) => Promise<SpaceMemberRole | undefined>;

type DirectAccessMutationInput = {
    account: RegisteredAccount;
    resource: DirectAccessResource;
};

export class DirectAccessService extends BaseService {
    private readonly models: DirectAccessModels;

    private readonly actorRoleResolver: DirectAccessActorRoleResolver;

    private readonly featureGate: DirectAccessFeatureGate;

    private readonly auditLogger?: DirectAccessAuditLogger;

    constructor({
        models,
        actorRoleResolver,
        featureGate,
        auditLogger,
    }: {
        models: DirectAccessModels;
        actorRoleResolver: DirectAccessActorRoleResolver;
        featureGate: DirectAccessFeatureGate;
        auditLogger?: DirectAccessAuditLogger;
    }) {
        super();
        this.models = models;
        this.actorRoleResolver = actorRoleResolver;
        this.featureGate = featureGate;
        this.auditLogger = auditLogger;
    }

    private static getOrganizationUuid(account: RegisteredAccount): UUID {
        const { organizationUuid } = account.organization;
        if (organizationUuid === undefined) {
            throw new ForbiddenError('Direct access is not available');
        }
        return organizationUuid;
    }

    private createActorRoleResolver(
        input: DirectAccessMutationInput,
    ): DirectAccessModelActorRoleResolver {
        const organizationUuid = DirectAccessService.getOrganizationUuid(
            input.account,
        );
        return ({ transaction, context }) => {
            if (context.organizationUuid !== organizationUuid) {
                throw new ForbiddenError('Direct access is not available');
            }
            return this.actorRoleResolver({
                account: input.account,
                organizationUuid,
                phase: 'transaction',
                transaction,
                context,
                resource: input.resource,
            });
        };
    }

    private resolveActorRole(
        input: DirectAccessMutationInput,
    ): Promise<SpaceMemberRole | undefined> {
        const organizationUuid = DirectAccessService.getOrganizationUuid(
            input.account,
        );
        return this.actorRoleResolver({
            account: input.account,
            organizationUuid,
            phase: 'preflight',
            resource: input.resource,
        });
    }

    private async prepareMutation(input: DirectAccessMutationInput): Promise<{
        organizationUuid: UUID;
        actorRole?: SpaceMemberRole;
        actorRoleResolver: DirectAccessModelActorRoleResolver;
    }> {
        const organizationUuid = DirectAccessService.getOrganizationUuid(
            input.account,
        );
        await this.featureGate.assertEnabled(input.account);
        const actorRole = await this.resolveActorRole(input);
        return {
            organizationUuid,
            actorRole,
            actorRoleResolver: this.createActorRoleResolver(input),
        };
    }

    private getModel(
        resourceType: DirectAccessResourceType,
    ): DirectAccessModel {
        return this.models[resourceType];
    }

    private auditMutation(
        input: DirectAccessMutationInput,
        principal: { type: 'user' | 'group'; uuid: UUID },
        result: DirectAccessMutationResult,
    ): void {
        auditDirectAccessMutation({
            actor: createActorFromAccount(input.account),
            context: input.account.requestContext ?? {},
            resourceType: auditResourceTypes[input.resource.type],
            resourceUuid: input.resource.uuid,
            principal,
            result,
            auditLogger: this.auditLogger,
        });
    }

    private auditReset(
        input: DirectAccessMutationInput,
        result: DirectAccessResetResult,
    ): void {
        auditDirectAccessReset({
            actor: createActorFromAccount(input.account),
            context: input.account.requestContext ?? {},
            resourceType: auditResourceTypes[input.resource.type],
            resourceUuid: input.resource.uuid,
            result,
            auditLogger: this.auditLogger,
        });
    }

    async getUserAccess({
        account,
        resourceType,
        resourceUuids,
    }: {
        account: RegisteredAccount;
        resourceType: DirectAccessResourceType;
        resourceUuids: UUID[];
    }): Promise<Record<string, DirectAccess>> {
        const organizationUuid =
            DirectAccessService.getOrganizationUuid(account);
        if (!(await this.featureGate.isEnabled(account))) {
            return {};
        }
        return this.getModel(resourceType).getUserAccess(
            resourceUuids,
            account.user.userUuid,
            { organizationUuid },
        );
    }

    async resolveUserAccess({
        account,
        resourceType,
        resources,
    }: {
        account: RegisteredAccount;
        resourceType: DirectAccessResourceType;
        resources: DirectAccessResources;
    }): Promise<Record<string, SpaceMemberRole | undefined>> {
        const organizationUuid =
            DirectAccessService.getOrganizationUuid(account);
        if (!(await this.featureGate.isEnabled(account))) {
            // Disabled preserves pure logical-space behavior: capability
            // ceilings belong to the direct-access feature and only apply
            // while it is enabled.
            return getLogicalAccessBatch(resources);
        }
        const directAccess = await this.getModel(resourceType).getUserAccess(
            Object.keys(resources),
            account.user.userUuid,
            { organizationUuid },
        );
        return resolveDirectAccessBatch({
            resources,
            directAccess,
            organizationUuid,
        });
    }

    async upsertUserAccess(
        input: DirectAccessMutationInput & {
            userUuid: UUID;
            role: SpaceMemberRole;
        },
    ): Promise<void> {
        const { actorRole, actorRoleResolver, organizationUuid } =
            await this.prepareMutation(input);
        const result = await this.getModel(
            input.resource.type,
        ).upsertUserAccess({
            resourceUuid: input.resource.uuid,
            userUuid: input.userUuid,
            role: input.role,
            actorRole,
            actorRoleResolver,
            grantedByUserUuid: input.account.user.userUuid,
            organizationUuid,
        });
        this.auditMutation(
            input,
            { type: 'user', uuid: input.userUuid },
            result,
        );
    }

    async upsertGroupAccess(
        input: DirectAccessMutationInput & {
            groupUuid: UUID;
            role: SpaceMemberRole;
        },
    ): Promise<void> {
        const { actorRole, actorRoleResolver, organizationUuid } =
            await this.prepareMutation(input);
        const result = await this.getModel(
            input.resource.type,
        ).upsertGroupAccess({
            resourceUuid: input.resource.uuid,
            groupUuid: input.groupUuid,
            role: input.role,
            actorRole,
            actorRoleResolver,
            grantedByUserUuid: input.account.user.userUuid,
            organizationUuid,
        });
        this.auditMutation(
            input,
            { type: 'group', uuid: input.groupUuid },
            result,
        );
    }

    async revokeUserAccess(
        input: DirectAccessMutationInput & { userUuid: UUID },
    ): Promise<void> {
        const { actorRole, actorRoleResolver, organizationUuid } =
            await this.prepareMutation(input);
        const result = await this.getModel(
            input.resource.type,
        ).revokeUserAccess({
            resourceUuid: input.resource.uuid,
            userUuid: input.userUuid,
            actorRole,
            actorRoleResolver,
            actorUserUuid: input.account.user.userUuid,
            organizationUuid,
        });
        this.auditMutation(
            input,
            { type: 'user', uuid: input.userUuid },
            result,
        );
    }

    async revokeGroupAccess(
        input: DirectAccessMutationInput & { groupUuid: UUID },
    ): Promise<void> {
        const { actorRole, actorRoleResolver, organizationUuid } =
            await this.prepareMutation(input);
        const result = await this.getModel(
            input.resource.type,
        ).revokeGroupAccess({
            resourceUuid: input.resource.uuid,
            groupUuid: input.groupUuid,
            actorRole,
            actorRoleResolver,
            organizationUuid,
        });
        this.auditMutation(
            input,
            { type: 'group', uuid: input.groupUuid },
            result,
        );
    }

    async resetAccess(input: DirectAccessMutationInput): Promise<void> {
        const { actorRole, actorRoleResolver, organizationUuid } =
            await this.prepareMutation(input);
        const result = await this.getModel(input.resource.type).resetAccess({
            resourceUuid: input.resource.uuid,
            actorRole,
            actorRoleResolver,
            organizationUuid,
        });
        this.auditReset(input, result);
    }
}
