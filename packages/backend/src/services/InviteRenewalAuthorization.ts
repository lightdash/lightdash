import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getUncoveredPermissions,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { fromSession } from '../auth/account';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type RolesModel } from '../models/RolesModel';
import { type SpacePermissionModel } from '../models/SpacePermissionModel';
import { type UserModel } from '../models/UserModel';
import {
    getOrganizationPatScopes,
    getOrganizationSystemRoleScopes,
    validateOrganizationScopesCanBeGranted,
    validateProjectScopesCanBeGranted,
} from '../utils/organizationRolePermissions';
import { BaseService } from './BaseService';
import { type DirectAccessService } from './DirectAccess/DirectAccessService';
import { type SpacePermissionService } from './SpaceService/SpacePermissionService';

type InviteRenewalAuthorizationArgs = {
    rolesModel: RolesModel;
    userModel: Pick<
        UserModel,
        'getUserProjectRoleAssignments' | 'findSessionUserAndOrgByUuid'
    >;
    projectModel: Pick<ProjectModel, 'getSummaries'>;
    spacePermissionModel: Pick<SpacePermissionModel, 'findGrantedSpaceUuids'>;
    spacePermissionService: Pick<SpacePermissionService, 'can'>;
    directAccessService: Pick<
        DirectAccessService,
        'assertCanRenewSharedAccess'
    >;
};

export class InviteRenewalAuthorization extends BaseService {
    constructor(private readonly dependencies: InviteRenewalAuthorizationArgs) {
        super();
    }

    async assertCanRenew({
        user,
        recipientUuid,
        organizationUuid,
        canGrantRoles,
        patEnabled,
    }: {
        user: SessionUser;
        recipientUuid: string;
        organizationUuid: string;
        canGrantRoles: boolean;
        patEnabled: boolean;
    }): Promise<void> {
        const {
            rolesModel,
            userModel,
            projectModel,
            spacePermissionModel,
            spacePermissionService,
            directAccessService,
        } = this.dependencies;
        const { systemRole, customRoleUuids } =
            await rolesModel.getOrganizationUserRoleSet(
                organizationUuid,
                recipientUuid,
            );
        const loadCustomScopes = async (
            roleUuids: string[],
        ): Promise<string[]> => {
            const roles = await Promise.all(
                roleUuids.map((uuid) =>
                    rolesModel.getRoleWithScopesByUuid(uuid),
                ),
            );
            if (
                roles.some((role) => role.organizationUuid !== organizationUuid)
            )
                throw new ForbiddenError();
            return roles.flatMap((role) => role.scopes);
        };

        const [orgCustomScopes, patScopes] = await Promise.all([
            loadCustomScopes(customRoleUuids),
            patEnabled
                ? userModel
                      .findSessionUserAndOrgByUuid(
                          recipientUuid,
                          organizationUuid,
                      )
                      .then(getOrganizationPatScopes)
                : [],
        ]);
        const recipientOrgScopes = [
            ...(systemRole ? getOrganizationSystemRoleScopes(systemRole) : []),
            ...orgCustomScopes,
        ];
        if (
            !canGrantRoles &&
            getUncoveredPermissions(
                recipientOrgScopes,
                getOrganizationSystemRoleScopes(OrganizationMemberRole.MEMBER),
            ).length > 0
        ) {
            throw new ForbiddenError(
                'You do not have permission to renew this invitation',
            );
        }
        await validateOrganizationScopesCanBeGranted({
            user,
            organizationUuid,
            grantedScopes: [...recipientOrgScopes, ...patScopes],
            rolesModel,
        });

        // Built-in organization admins already administer project and sharing grants.
        if (
            user.role === OrganizationMemberRole.ADMIN &&
            !user.roleUuid &&
            canGrantRoles
        )
            return;

        const [projectRoles, spaceUuids] = await Promise.all([
            userModel.getUserProjectRoleAssignments(
                recipientUuid,
                organizationUuid,
            ),
            spacePermissionModel.findGrantedSpaceUuids(
                recipientUuid,
                organizationUuid,
            ),
        ]);
        if (projectRoles.length > 0) {
            const projectUuids = [
                ...new Set(projectRoles.map((role) => role.projectUuid)),
            ];
            const projects = await projectModel.getSummaries(projectUuids);
            const ability = this.createAuditedAbility(user);
            if (
                projects.length !== projectUuids.length ||
                projects.some(
                    (project) =>
                        project.organizationUuid !== organizationUuid ||
                        ability.cannot('manage', subject('Project', project)),
                )
            )
                throw new ForbiddenError(
                    'You do not have permission to renew this invitation',
                );

            const projectCustomScopes = await loadCustomScopes([
                ...new Set(
                    projectRoles.flatMap((role) => [
                        ...(role.roleUuid ? [role.roleUuid] : []),
                        ...(role.extraRoleUuids ?? []),
                    ]),
                ),
            ]);
            // Built-in project roles use the same manage check as project access writes.
            validateProjectScopesCanBeGranted({
                user,
                grantedScopes: projectCustomScopes,
            });
        }
        if (
            spaceUuids.length > 0 &&
            !(await spacePermissionService.can('manage', user, spaceUuids))
        ) {
            throw new ForbiddenError(
                'You do not have permission to renew this invitation',
            );
        }
        await directAccessService.assertCanRenewSharedAccess(
            fromSession(user),
            recipientUuid,
        );
    }
}
