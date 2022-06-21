import { Ability, AbilityBuilder } from '@casl/ability';
import { OrganizationMemberProfile } from '../types/organizationMemberProfile';
import { ProjectMemberProfile } from '../types/projectMemberProfile';
import { organizationMemberAbilities } from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { MemberAbility } from './types';

export const getUserAbilityBuilder = (
    organizationProfile: Pick<
        OrganizationMemberProfile,
        'role' | 'organizationUuid' | 'userUuid'
    >,
    projectProfiles: Pick<ProjectMemberProfile, 'projectUuid' | 'role'>[],
) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (organizationProfile) {
        organizationMemberAbilities[organizationProfile.role](
            organizationProfile,
            builder,
        );
    }
    projectProfiles.forEach((projectProfile) => {
        projectMemberAbilities[projectProfile.role](projectProfile, builder);
    });
    return builder;
};

export const defineUserAbility = (
    organizationProfile: Pick<
        OrganizationMemberProfile,
        'role' | 'organizationUuid' | 'userUuid'
    >,
    projectProfiles: Pick<ProjectMemberProfile, 'projectUuid' | 'role'>[],
): MemberAbility => {
    const builder = getUserAbilityBuilder(organizationProfile, projectProfiles);
    return builder.build();
};
