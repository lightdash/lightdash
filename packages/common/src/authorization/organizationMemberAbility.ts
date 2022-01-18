import { Ability, AbilityBuilder, ForcedSubject } from '@casl/ability';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '../types/organizationMemberProfile';

const actions = ['manage', 'create', 'update', 'view'] as const;
const subjects = ['all'] as const;

type PossibleAbilities = [
    typeof actions[number],
    (
        | typeof subjects[number]
        | ForcedSubject<Exclude<typeof subjects[number], 'all'>>
    ),
];

export type OrganizationMemberAbility = Ability<PossibleAbilities>;

const organizationMemberAbilities: Record<
    OrganizationMemberRole,
    (
        member: OrganizationMemberProfile,
        builder: AbilityBuilder<OrganizationMemberAbility>,
    ) => void
> = {
    viewer(member, { can }) {
        can('view', 'all');
    },
    editor(member, { can }) {
        can('create', 'all');
        can('update', 'all');
    },
    admin(member, { can }) {
        can('manage', 'all');
    },
};

export const defineAbilityForOrganizationMember = (
    member: OrganizationMemberProfile | undefined,
): OrganizationMemberAbility => {
    const builder = new AbilityBuilder<OrganizationMemberAbility>(Ability);
    if (member) {
        organizationMemberAbilities[member.role](member, builder);
    }
    return builder.build();
};
