import { Ability, AbilityBuilder, ForcedSubject } from '@casl/ability';
import { Organization } from '../types/organization';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '../types/organizationMemberProfile';

type Action = 'manage' | 'update' | 'view' | 'create' | 'delete';

type Subject =
    | Organization
    | OrganizationMemberProfile
    | 'Organization'
    | 'OrganizationMemberProfile'
    | 'Dashboard'
    | 'SavedChart'
    | 'Project'
    | 'InviteLink'
    | 'Job'
    | 'all';

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
        builder: Pick<AbilityBuilder<OrganizationMemberAbility>, 'can'>,
    ) => void
> = {
    viewer(member, { can }) {
        can('view', 'Dashboard', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'SavedChart', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Project', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Organization', {
            organizationUuid: member.organizationUuid,
        });

        can('view', 'Job', { userUuid: member.userUuid });
    },
    editor(member, { can }) {
        organizationMemberAbilities.viewer(member, { can });
        can('manage', 'Project', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Dashboard', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'SavedChart', {
            organizationUuid: member.organizationUuid,
        });
        can('create', 'InviteLink', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Job');
        can('view', 'OrganizationMemberProfile', {
            organizationUuid: member.organizationUuid,
        });
    },
    admin(member, { can }) {
        can('manage', 'InviteLink', {
            organizationUuid: member.organizationUuid,
        });
        organizationMemberAbilities.editor(member, { can });
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
