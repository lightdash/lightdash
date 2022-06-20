import { AbilityBuilder } from '@casl/ability';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '../types/organizationMemberProfile';
import { MemberAbility } from './types';

// eslint-disable-next-line import/prefer-default-export
export const organizationMemberAbilities: Record<
    OrganizationMemberRole,
    (
        member: Pick<
            OrganizationMemberProfile,
            'role' | 'organizationUuid' | 'userUuid'
        >,
        builder: Pick<AbilityBuilder<MemberAbility>, 'can'>,
    ) => void
> = {
    member(member, { can }) {
        can('create', 'InviteLink', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'OrganizationMemberProfile', {
            organizationUuid: member.organizationUuid,
        });
    },
    viewer(member, { can }) {
        organizationMemberAbilities.member(member, { can });
        can('view', 'Dashboard', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'SavedChart', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Project', {
            organizationUuid: {
                organizationUuid: {
                    $eq: member.organizationUuid,
                    $exists: true,
                },
            },
        });
        can('view', 'Organization', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Job', { userUuid: member.userUuid });
    },
    editor(member, { can }) {
        organizationMemberAbilities.viewer(member, { can });
        can('manage', 'Project', {
            organizationUuid: { $eq: member.organizationUuid, $exists: true },
        });
        can('manage', 'Dashboard', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'SavedChart', {
            organizationUuid: member.organizationUuid,
        });

        can('manage', 'Job');
    },
    admin(member, { can }) {
        organizationMemberAbilities.editor(member, { can });
        can('manage', 'InviteLink', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Organization', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'OrganizationMemberProfile', {
            organizationUuid: member.organizationUuid,
        });
    },
};
