import { Ability, AbilityBuilder } from '@casl/ability';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type LightdashUser } from '../types/user';
import { organizationMemberAbilities } from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { type MemberAbility } from './types';

export const getUserAbilityBuilder = (
    user: Pick<LightdashUser, 'role' | 'organizationUuid' | 'userUuid'>,
    projectProfiles: Pick<
        ProjectMemberProfile,
        'projectUuid' | 'role' | 'userUuid'
    >[],
) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (user.role && user.organizationUuid) {
        organizationMemberAbilities[user.role](
            {
                organizationUuid: user.organizationUuid,
                userUuid: user.userUuid,
            },
            builder,
        );
        projectProfiles.forEach((projectProfile) => {
            projectMemberAbilities[projectProfile.role](
                projectProfile,
                builder,
            );
        });
    }
    return builder;
};

export const defineUserAbility = (
    user: Pick<LightdashUser, 'role' | 'organizationUuid' | 'userUuid'>,
    projectProfiles: Pick<
        ProjectMemberProfile,
        'projectUuid' | 'role' | 'userUuid'
    >[],
): MemberAbility => {
    const builder = getUserAbilityBuilder(user, projectProfiles);
    return builder.build();
};
