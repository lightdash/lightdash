import { Ability, AbilityBuilder } from '@casl/ability';
import { NotFoundError } from '../types/errors';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type Role, type RoleWithScopes } from '../types/roles';
import { type LightdashUser } from '../types/user';
import applyOrganizationMemberAbilities, {
    type OrganizationMemberAbilitiesArgs,
} from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

type UserAbilityBuilderArgs = {
    user: Pick<
        LightdashUser,
        'role' | 'organizationUuid' | 'userUuid' | 'roleUuid'
    >;
    projectProfiles: Pick<
        ProjectMemberProfile,
        'projectUuid' | 'role' | 'userUuid' | 'roleUuid'
    >[];
    permissionsConfig: OrganizationMemberAbilitiesArgs['permissionsConfig'];
    customRoleScopes?: Record<Role['roleUuid'], RoleWithScopes['scopes']>;
    customRolesEnabled?: boolean;
    isEnterprise?: boolean;
};

export const JWT_HEADER_NAME = 'lightdash-embed-token';

export const getUserAbilityBuilder = ({
    user,
    projectProfiles,
    permissionsConfig,
    customRoleScopes,
    customRolesEnabled,
    isEnterprise,
}: UserAbilityBuilderArgs) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (user.role && user.organizationUuid) {
        // Org-level custom role: if the user's organization_memberships row
        // points at a role_uuid AND custom roles are enabled AND we have the
        // role's scopes, build CASL from those scopes (same path as
        // project-level custom roles below). Falls back to the system role
        // path otherwise.
        const orgCustomRoleScopes =
            customRolesEnabled && user.roleUuid
                ? customRoleScopes?.[user.roleUuid]
                : undefined;

        if (orgCustomRoleScopes) {
            buildAbilityFromScopes(
                {
                    organizationUuid: user.organizationUuid,
                    userUuid: user.userUuid,
                    scopes: orgCustomRoleScopes,
                    isEnterprise,
                    organizationRole: user.role,
                    permissionsConfig,
                },
                builder,
            );
        } else {
            applyOrganizationMemberAbilities({
                role: user.role,
                member: {
                    organizationUuid: user.organizationUuid,
                    userUuid: user.userUuid,
                },
                builder,
                permissionsConfig,
            });
        }

        projectProfiles.forEach((projectProfile) => {
            if (projectProfile.roleUuid && customRolesEnabled) {
                if (!user.organizationUuid) {
                    throw new NotFoundError(
                        `Organization with uuid ${user.organizationUuid} was not found`,
                    );
                }

                const scopes = customRoleScopes?.[projectProfile.roleUuid];
                if (!scopes) {
                    // eslint-disable-next-line no-console
                    console.error(
                        `Custom role with uuid ${projectProfile.roleUuid} was not found`,
                    );
                    return;
                }

                buildAbilityFromScopes(
                    {
                        projectUuid: projectProfile.projectUuid,
                        userUuid: user.userUuid,
                        scopes,
                        isEnterprise,
                        organizationRole: user.role,
                        permissionsConfig,
                    },
                    builder,
                );
            } else {
                projectMemberAbilities[projectProfile.role](
                    projectProfile,
                    builder,
                );
            }
        });
    }
    return builder;
};

// Defines user ability for test purposes
export const defineUserAbility = (
    user: Pick<
        LightdashUser,
        'role' | 'organizationUuid' | 'userUuid' | 'roleUuid'
    >,
    projectProfiles: Pick<
        ProjectMemberProfile,
        'projectUuid' | 'role' | 'userUuid' | 'roleUuid'
    >[],
    customRoleScopes?: Record<Role['roleUuid'], RoleWithScopes['scopes']>,
): MemberAbility => {
    const builder = getUserAbilityBuilder({
        user,
        projectProfiles,
        permissionsConfig: {
            pat: {
                enabled: false,
                allowedOrgRoles: [],
            },
        },
        customRoleScopes,
    });
    return builder.build();
};
