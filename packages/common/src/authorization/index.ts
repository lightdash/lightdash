import { Ability, AbilityBuilder } from '@casl/ability';
import { NotFoundError } from '../types/errors';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type Role, type RoleWithScopes } from '../types/roles';
import { type LightdashUser } from '../types/user';
import applyOrganizationMemberAbilities, {
    type OrganizationMemberAbilitiesArgs,
} from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
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
};

export * from './buildAccountHelpers';
export * from './jwtAbility';
export * from './parseAccount';
export * from './serviceAccountAbility';

export const JWT_HEADER_NAME = 'lightdash-embed-token';

export const getUserAbilityBuilder = ({
    user,
    projectProfiles,
    permissionsConfig,
    customRoleScopes,
}: UserAbilityBuilderArgs) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (user.role && user.organizationUuid) {
        if (user.roleUuid) {
            // TODO apply custom role abilities
            const scopes = customRoleScopes?.[user.roleUuid];
            if (scopes) {
                throw new NotFoundError(
                    `Custom role with uuid ${user.roleUuid} was not found`,
                );
            }
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
            if (projectProfile.roleUuid) {
                const scopes = customRoleScopes?.[projectProfile.roleUuid];
                if (scopes) {
                    throw new NotFoundError(
                        `Custom role with uuid ${user.roleUuid} was not found`,
                    );
                }
                // TODO apply custom role abilities
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
