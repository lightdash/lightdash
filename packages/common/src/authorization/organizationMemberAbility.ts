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
            'organizationUuid' | 'userUuid'
        >,
        builder: Pick<AbilityBuilder<MemberAbility>, 'can'>,
    ) => void
> = {
    member(member, { can }) {
        can('view', 'OrganizationMemberProfile', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'CsvJobResult', {
            createdByUserUuid: member.userUuid,
        });
    },
    viewer(member, { can }) {
        organizationMemberAbilities.member(member, { can });
        can('view', 'Dashboard', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Space', {
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
    },
    interactive_viewer(member, { can }) {
        organizationMemberAbilities.viewer(member, { can });
        can('create', 'Project', {
            organizationUuid: member.organizationUuid,
        });
        can('create', 'Job');
        can('view', 'Job', { userUuid: member.userUuid });
        can('view', 'UnderlyingData', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'ExportCsv', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Explore', {
            organizationUuid: member.organizationUuid,
        });
    },
    editor(member, { can }) {
        organizationMemberAbilities.interactive_viewer(member, { can });
        can('manage', 'Dashboard', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Space', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'SavedChart', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Job');
    },
    developer(member, { can }) {
        organizationMemberAbilities.editor(member, { can });
        can('manage', 'SqlRunner', {
            organizationUuid: member.organizationUuid,
        });
    },
    admin(member, { can }) {
        organizationMemberAbilities.developer(member, { can });
        can('manage', 'Project', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'InviteLink', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Organization', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Analytics', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'OrganizationMemberProfile', {
            organizationUuid: member.organizationUuid,
        });
    },
};
