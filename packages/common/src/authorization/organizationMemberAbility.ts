import { Ability, AbilityBuilder, ForcedSubject } from '@casl/ability';
import { Organization } from '../types/organization';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '../types/organizationMemberProfile';
import { LightdashUser } from '../types/user';

type Action = 'manage' | 'create' | 'update' | 'view';

type Subject =
    | 'all'
    | Organization
    | 'Organization'
    | LightdashUser
    | 'LightdashUser'
    | 'OrganizationMemberProfile'
    | OrganizationMemberProfile;

type PossibleAbilities = [
    Action,
    Subject | ForcedSubject<Exclude<Subject, 'all'>>,
];

export type OrganizationMemberAbility = Ability<PossibleAbilities>;

const organizationMemberAbilities: Record<
    OrganizationMemberRole,
    (
        member: Pick<
            OrganizationMemberProfile,
            'role' | 'organizationUuid' | 'userUuid'
        >,
        builder: AbilityBuilder<OrganizationMemberAbility>,
    ) => void
> = {
    viewer() {},
    editor() {},
    admin(member, { can }) {
        can('manage', 'Organization', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'OrganizationMemberProfile', {
            organizationUuid: member.organizationUuid,
        });
    },
};

export const defineAbilityForOrganizationMember = (
    member:
        | Pick<
              OrganizationMemberProfile,
              'role' | 'organizationUuid' | 'userUuid'
          >
        | undefined,
): OrganizationMemberAbility => {
    const builder = new AbilityBuilder<OrganizationMemberAbility>(Ability);
    if (member) {
        organizationMemberAbilities[member.role](member, builder);
    }
    return builder.build();
};
