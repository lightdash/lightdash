import { subject } from '@casl/ability';
import {
    assertUnreachable,
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    ForbiddenError,
    NotFoundError,
    type DirectAccessAssignment,
    type DirectAccessPrincipalRef,
    type RegisteredAccount,
    type SpaceMemberRole,
    type UUID,
} from '@lightdash/common';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import {
    type DirectAccessModel,
    type DirectAccessResourceLocation,
} from '../../models/DirectAccessModel';
import { BaseService } from '../BaseService';
import {
    type AccessTarget,
    type SpacePermissionService,
} from '../SpaceService/SpacePermissionService';
import {
    auditDirectAccessMutation,
    auditDirectAccessReset,
} from './directAccessAudit';
import { type DirectAccessFeatureGate } from './DirectAccessFeatureGate';

type DirectAccessServiceArguments = {
    directAccessModel: DirectAccessModel;
    spacePermissionService: SpacePermissionService;
    directAccessFeatureGate: DirectAccessFeatureGate;
};

/**
 * One administration seam for direct access across every registered resource
 * type. Requests are feature-gated, resolved against the concrete resource,
 * and authorized for effective admins through the existing access context:
 * space-backed resources require the same standing that administers space
 * sharing today (org/project admins, space admins, and admin-role direct
 * grants), while personal apps fall back to data-app management (their
 * creator plus org/project admins).
 */
export class DirectAccessService extends BaseService {
    private readonly directAccessModel: DirectAccessModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly directAccessFeatureGate: DirectAccessFeatureGate;

    constructor(args: DirectAccessServiceArguments) {
        super();
        this.directAccessModel = args.directAccessModel;
        this.spacePermissionService = args.spacePermissionService;
        this.directAccessFeatureGate = args.directAccessFeatureGate;
    }

    private static toAccessTarget(
        resourceType: DirectAccessResourceType,
        resourceUuid: UUID,
        location: DirectAccessResourceLocation,
    ): AccessTarget {
        // Only apps can be space-less; a space-backed type without a space is
        // an inconsistent row, not a target we can authorize against.
        const requireSpaceUuid = (): UUID => {
            if (location.spaceUuid === null) {
                throw new NotFoundError('Direct access target not found');
            }
            return location.spaceUuid;
        };

        switch (resourceType) {
            case DirectAccessResourceType.DASHBOARD:
                return {
                    type: 'dashboard',
                    dashboardUuid: resourceUuid,
                    spaceUuid: requireSpaceUuid(),
                };
            case DirectAccessResourceType.CHART:
                return {
                    type: 'chart',
                    chartUuid: resourceUuid,
                    dashboardUuid: location.dashboardUuid,
                    spaceUuid: requireSpaceUuid(),
                };
            case DirectAccessResourceType.SQL_CHART:
                return {
                    type: 'sqlChart',
                    savedSqlUuid: resourceUuid,
                    spaceUuid: requireSpaceUuid(),
                };
            case DirectAccessResourceType.APP:
                return {
                    type: 'app',
                    appUuid: resourceUuid,
                    organizationUuid: location.organizationUuid,
                    projectUuid: location.projectUuid,
                    spaceUuid: location.spaceUuid,
                };
            default:
                return assertUnreachable(
                    resourceType,
                    'Unsupported direct access resource type',
                );
        }
    }

    private async authorizeManage(
        account: RegisteredAccount,
        projectUuid: UUID,
        resourceType: DirectAccessResourceType,
        resourceUuid: UUID,
    ): Promise<{ organizationUuid: UUID }> {
        await this.directAccessFeatureGate.assertEnabled(account);

        const { organizationUuid } = account.organization;
        if (organizationUuid === undefined) {
            throw new ForbiddenError('Direct access is not available');
        }
        const location = await this.directAccessModel.findResourceLocation(
            resourceType,
            resourceUuid,
            organizationUuid,
        );
        if (location === undefined || location.projectUuid !== projectUuid) {
            throw new NotFoundError('Direct access target not found');
        }

        const context = await this.spacePermissionService.resolveAccess(
            account.user.userUuid,
            DirectAccessService.toAccessTarget(
                resourceType,
                resourceUuid,
                location,
            ),
        );
        const ability = this.createAuditedAbility(account);
        const authorized =
            location.spaceUuid !== null
                ? ability.can('manage', subject('Space', context))
                : ability.can(
                      'manage',
                      subject('DataApp', {
                          ...context,
                          // A null creator can never match the self rule.
                          createdByUserUuid: location.createdByUserUuid ?? '',
                      }),
                  );
        if (!authorized) {
            throw new ForbiddenError(
                'You do not have permission to manage direct access for this resource',
            );
        }
        return { organizationUuid };
    }

    private static toAuditPrincipal(principal: DirectAccessPrincipalRef): {
        type: 'user' | 'group';
        uuid: string;
    } {
        return {
            type:
                principal.type === DirectAccessPrincipalType.USER
                    ? 'user'
                    : 'group',
            uuid: principal.uuid,
        };
    }

    async listAssignments(
        account: RegisteredAccount,
        projectUuid: UUID,
        resourceType: DirectAccessResourceType,
        resourceUuid: UUID,
    ): Promise<DirectAccessAssignment[]> {
        const { organizationUuid } = await this.authorizeManage(
            account,
            projectUuid,
            resourceType,
            resourceUuid,
        );
        return this.directAccessModel.listAssignments({
            resourceType,
            resourceUuid,
            organizationUuid,
        });
    }

    async upsertAssignment(
        account: RegisteredAccount,
        projectUuid: UUID,
        resourceType: DirectAccessResourceType,
        resourceUuid: UUID,
        principal: DirectAccessPrincipalRef,
        role: SpaceMemberRole,
    ): Promise<void> {
        const { organizationUuid } = await this.authorizeManage(
            account,
            projectUuid,
            resourceType,
            resourceUuid,
        );
        const result = await this.directAccessModel.upsertAccess({
            resourceType,
            resourceUuid,
            principal,
            role,
            organizationUuid,
            grantedByUserUuid: account.user.userUuid,
        });
        auditDirectAccessMutation({
            actor: createActorFromAccount(account),
            context: {},
            resourceType,
            resourceUuid,
            principal: DirectAccessService.toAuditPrincipal(principal),
            result,
        });
    }

    async revokeAssignment(
        account: RegisteredAccount,
        projectUuid: UUID,
        resourceType: DirectAccessResourceType,
        resourceUuid: UUID,
        principal: DirectAccessPrincipalRef,
    ): Promise<void> {
        const { organizationUuid } = await this.authorizeManage(
            account,
            projectUuid,
            resourceType,
            resourceUuid,
        );
        const result = await this.directAccessModel.revokeAccess({
            resourceType,
            resourceUuid,
            principal,
            organizationUuid,
        });
        auditDirectAccessMutation({
            actor: createActorFromAccount(account),
            context: {},
            resourceType,
            resourceUuid,
            principal: DirectAccessService.toAuditPrincipal(principal),
            result,
        });
    }

    async resetAssignments(
        account: RegisteredAccount,
        projectUuid: UUID,
        resourceType: DirectAccessResourceType,
        resourceUuid: UUID,
    ): Promise<void> {
        const { organizationUuid } = await this.authorizeManage(
            account,
            projectUuid,
            resourceType,
            resourceUuid,
        );
        const result = await this.directAccessModel.resetAccess({
            resourceType,
            resourceUuid,
            organizationUuid,
        });
        auditDirectAccessReset({
            actor: createActorFromAccount(account),
            context: {},
            resourceType,
            resourceUuid,
            result,
        });
    }
}
