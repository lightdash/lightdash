import {
    ForbiddenError,
    type RegisteredAccount,
    type SpaceMemberRole,
    type UUID,
} from '@lightdash/common';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import {
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
    constructor(
        private readonly models: DirectAccessModels,
        private readonly actorRoleResolver: DirectAccessActorRoleResolver,
        private readonly auditLogger?: DirectAccessAuditLogger,
    ) {
        super();
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

    async upsertUserAccess(
        input: DirectAccessMutationInput & {
            userUuid: UUID;
            role: SpaceMemberRole;
        },
    ): Promise<void> {
        const actorRole = await this.resolveActorRole(input);
        const actorRoleResolver = this.createActorRoleResolver(input);
        const result = await this.getModel(
            input.resource.type,
        ).upsertUserAccess({
            resourceUuid: input.resource.uuid,
            userUuid: input.userUuid,
            role: input.role,
            actorRole,
            actorRoleResolver,
            grantedByUserUuid: input.account.user.userUuid,
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
        const actorRole = await this.resolveActorRole(input);
        const actorRoleResolver = this.createActorRoleResolver(input);
        const result = await this.getModel(
            input.resource.type,
        ).upsertGroupAccess({
            resourceUuid: input.resource.uuid,
            groupUuid: input.groupUuid,
            role: input.role,
            actorRole,
            actorRoleResolver,
            grantedByUserUuid: input.account.user.userUuid,
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
        const actorRole = await this.resolveActorRole(input);
        const actorRoleResolver = this.createActorRoleResolver(input);
        const result = await this.getModel(
            input.resource.type,
        ).revokeUserAccess({
            resourceUuid: input.resource.uuid,
            userUuid: input.userUuid,
            actorRole,
            actorRoleResolver,
            actorUserUuid: input.account.user.userUuid,
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
        const actorRole = await this.resolveActorRole(input);
        const actorRoleResolver = this.createActorRoleResolver(input);
        const result = await this.getModel(
            input.resource.type,
        ).revokeGroupAccess({
            resourceUuid: input.resource.uuid,
            groupUuid: input.groupUuid,
            actorRole,
            actorRoleResolver,
        });
        this.auditMutation(
            input,
            { type: 'group', uuid: input.groupUuid },
            result,
        );
    }

    async resetAccess(input: DirectAccessMutationInput): Promise<void> {
        const actorRole = await this.resolveActorRole(input);
        const actorRoleResolver = this.createActorRoleResolver(input);
        const result = await this.getModel(input.resource.type).resetAccess({
            resourceUuid: input.resource.uuid,
            actorRole,
            actorRoleResolver,
        });
        this.auditReset(input, result);
    }
}
