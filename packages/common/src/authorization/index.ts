import { Ability, AbilityBuilder } from '@casl/ability';
import { type Account } from '../types/auth';
import { ForbiddenError } from '../types/errors';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type LightdashUser, type SessionUser } from '../types/user';
import applyOrganizationMemberAbilities, {
    type OrganizationMemberAbilitiesArgs,
} from './organizationMemberAbility';
import { projectMemberAbilities } from './projectMemberAbility';
import { type MemberAbility } from './types';

type UserAbilityBuilderArgs = {
    user: Pick<LightdashUser, 'role' | 'organizationUuid' | 'userUuid'>;
    projectProfiles: Pick<
        ProjectMemberProfile,
        'projectUuid' | 'role' | 'userUuid'
    >[];
    permissionsConfig: OrganizationMemberAbilitiesArgs['permissionsConfig'];
};

export * from './scopeAbility';
export * from './serviceAccountAbility';

export const getUserAbilityBuilder = ({
    user,
    projectProfiles,
    permissionsConfig,
}: UserAbilityBuilderArgs) => {
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
    });
    return builder.build();
};

export function getAbilityOrThrow(account?: Account, user?: SessionUser) {
    if (account && user) {
        throw new ForbiddenError('Cannot use both account and user');
    }

    if (account?.user.ability) {
        return account.user.ability;
    }
    if (user?.ability) {
        return user.ability;
    }

    throw new ForbiddenError('User has no ability');
}
