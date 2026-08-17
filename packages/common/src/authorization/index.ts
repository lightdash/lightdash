import { Ability, AbilityBuilder } from '@casl/ability';
import { NotFoundError } from '../types/errors';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type ProjectType } from '../types/projects';
import { type Role, type RoleWithScopes } from '../types/roles';
import { type LightdashUser } from '../types/user';
import { collapseAbilityRules } from './collapseAbilityRules';
import applyOrganizationMemberAbilities, {
    type OrganizationMemberAbilitiesArgs,
} from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { buildAbilityFromScopes } from './scopeAbilityBuilder';
import { type MemberAbility } from './types';

/**
 * Project membership plus the project metadata needed by @self scope
 * conditions (resolved at ability-build time, not per permission check).
 */
export type ProjectAbilityProfile = Pick<
    ProjectMemberProfile,
    'projectUuid' | 'role' | 'userUuid' | 'roleUuid'
> & {
    projectType?: ProjectType;
    projectCreatedByUserUuid?: string | null;
    /** Additional custom roles unioned on top of `role`/`roleUuid`. */
    extraRoleUuids?: string[];
};

type UserAbilityBuilderArgs = {
    user: Pick<
        LightdashUser,
        'role' | 'organizationUuid' | 'userUuid' | 'roleUuid'
    >;
    /** Additional organization custom roles unioned on top of the user's slot. */
    orgExtraRoleUuids?: string[];
    projectProfiles: ProjectAbilityProfile[];
    permissionsConfig: OrganizationMemberAbilitiesArgs['permissionsConfig'];
    customRoleScopes?: Record<Role['roleUuid'], RoleWithScopes['scopes']>;
    customRolesEnabled?: boolean;
    isEnterprise?: boolean;
};

export const JWT_HEADER_NAME = 'lightdash-embed-token';

export type UserAbilityBuilderResult = {
    builder: AbilityBuilder<MemberAbility>;
    invalidScopes: string[];
};

export const getUserAbilityBuilder = ({
    user,
    orgExtraRoleUuids = [],
    projectProfiles,
    permissionsConfig,
    customRoleScopes,
    customRolesEnabled,
    isEnterprise,
}: UserAbilityBuilderArgs): UserAbilityBuilderResult => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    const invalidScopes: string[] = [];
    // Extra custom roles are unioned on top of the slot; unknown uuids are
    // skipped (logged) rather than granting anything.
    const applyExtraRoles = (
        extraRoleUuids: string[],
        apply: (scopes: string[]) => string[],
    ) => {
        if (!customRolesEnabled) {
            return;
        }
        extraRoleUuids.forEach((roleUuid) => {
            const scopes = customRoleScopes?.[roleUuid];
            if (!scopes) {
                // eslint-disable-next-line no-console
                console.error(
                    `Custom role with uuid ${roleUuid} was not found`,
                );
                return;
            }
            invalidScopes.push(...apply(scopes));
        });
    };
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
            invalidScopes.push(
                ...buildAbilityFromScopes(
                    {
                        organizationUuid: user.organizationUuid,
                        userUuid: user.userUuid,
                        scopes: orgCustomRoleScopes,
                        isEnterprise,
                        organizationRole: user.role,
                        permissionsConfig,
                    },
                    builder,
                ),
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
        applyExtraRoles(orgExtraRoleUuids, (scopes) =>
            buildAbilityFromScopes(
                {
                    organizationUuid: user.organizationUuid as string,
                    userUuid: user.userUuid,
                    scopes,
                    isEnterprise,
                    organizationRole: user.role,
                    permissionsConfig,
                },
                builder,
            ),
        );

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

                invalidScopes.push(
                    ...buildAbilityFromScopes(
                        {
                            projectUuid: projectProfile.projectUuid,
                            projectType: projectProfile.projectType,
                            projectCreatedByUserUuid:
                                projectProfile.projectCreatedByUserUuid,
                            userUuid: user.userUuid,
                            scopes,
                            isEnterprise,
                            organizationRole: user.role,
                            permissionsConfig,
                        },
                        builder,
                    ),
                );
            } else {
                projectMemberAbilities[projectProfile.role](
                    projectProfile,
                    builder,
                );
            }
            applyExtraRoles(projectProfile.extraRoleUuids ?? [], (scopes) =>
                buildAbilityFromScopes(
                    {
                        projectUuid: projectProfile.projectUuid,
                        projectType: projectProfile.projectType,
                        projectCreatedByUserUuid:
                            projectProfile.projectCreatedByUserUuid,
                        userUuid: user.userUuid,
                        scopes,
                        isEnterprise,
                        organizationRole: user.role,
                        permissionsConfig,
                    },
                    builder,
                ),
            );
        });
    }
    // Collapse per-project rules into `{ $in: [...] }` so the rule set (and the
    // serialized `abilityRules` payload) scales with role tiers, not project count.
    builder.rules = collapseAbilityRules(builder.rules);
    return { builder, invalidScopes };
};

// Defines user ability for test purposes
export const defineUserAbility = (
    user: Pick<
        LightdashUser,
        'role' | 'organizationUuid' | 'userUuid' | 'roleUuid'
    >,
    projectProfiles: ProjectAbilityProfile[],
    customRoleScopes?: Record<Role['roleUuid'], RoleWithScopes['scopes']>,
): MemberAbility => {
    const { builder } = getUserAbilityBuilder({
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
