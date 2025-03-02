import { Ability, AbilityBuilder } from '@casl/ability';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type LightdashUser } from '../types/user';
import applyOrganizationMemberAbilities, {
    type OrganizationMemberAbilitiesArgs,
} from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { type MemberAbility } from './types';
// import { type ProjectMemberRole } from '../types/projectMemberRole';
// import { type OrganizationMemberRole } from '../types/organizationMemberProfile';

type UserAbilityBuilderArgs = {
    user: Pick<LightdashUser, 'role' | 'organizationUuid' | 'userUuid'>;
    projectProfiles: Pick<
        ProjectMemberProfile,
        'projectUuid' | 'role' | 'userUuid'
    >[];
    permissionsConfig: OrganizationMemberAbilitiesArgs['permissionsConfig'];
    // organizationRole: OrganizationMemberRole | null;
    groupMemberships: { groupUuid: string }[];
    // projectMemberships: {
    //     projectId: number;
    //     role: ProjectMemberRole;
    // }[];
};

export const getUserAbilityBuilder = ({
    user,
    projectProfiles,
    permissionsConfig,
    // organizationRole,
    groupMemberships,
}: // projectMemberships,
UserAbilityBuilderArgs) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (user.role && user.organizationUuid) {
        applyOrganizationMemberAbilities({
            role: user.role,
            member: {
                organizationUuid: user.organizationUuid,
                userUuid: user.userUuid,
            },
            builder,
            permissionsConfig,
        });
        projectProfiles.forEach((projectProfile) => {
            projectMemberAbilities[projectProfile.role](
                projectProfile,
                builder,
                groupMemberships,
            );
        });
    }
    return builder;
};

// Defines user ability for test purposes
export const defineUserAbility = (
    user: Pick<LightdashUser, 'role' | 'organizationUuid' | 'userUuid'>,
    projectProfiles: Pick<
        ProjectMemberProfile,
        'projectUuid' | 'role' | 'userUuid'
    >[],
    groupMemberships: { groupUuid: string }[] = [],
): MemberAbility => {
    const builder = getUserAbilityBuilder({
        user,
        projectProfiles,
        groupMemberships,
        permissionsConfig: {
            pat: {
                enabled: false,
                allowedOrgRoles: [],
            },
        },
    });
    return builder.build();
};
