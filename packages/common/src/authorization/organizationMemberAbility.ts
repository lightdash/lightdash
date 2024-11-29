import { type AbilityBuilder } from '@casl/ability';
import {
    type OrganizationMemberProfile,
    type OrganizationMemberRole,
} from '../types/organizationMemberProfile';
import { ProjectType } from '../types/projects';
import { SpaceMemberRole } from '../types/space';
import { type MemberAbility } from './types';

const applyOrganizationMemberDynamicAbilities = ({
    role,
    builder: { can },
    permissionsConfig,
}: OrganizationMemberAbilitiesArgs) => {
    if (
        permissionsConfig.pat.enabled &&
        permissionsConfig.pat.allowedOrgRoles.includes(role)
    ) {
        can('manage', 'PersonalAccessToken', {});
    }
};

const applyOrganizationMemberStaticAbilities: Record<
    OrganizationMemberRole,
    (
        member: OrganizationMemberAbilitiesArgs['member'],
        builder: OrganizationMemberAbilitiesArgs['builder'],
    ) => void
> = {
    member(member, { can }) {
        can('view', 'OrganizationMemberProfile', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'CsvJobResult', {
            createdByUserUuid: member.userUuid,
        });
        can('view', 'PinnedItems', {
            organizationUuid: member.organizationUuid,
        });
    },
    viewer(member, { can }) {
        applyOrganizationMemberStaticAbilities.member(member, { can });
        can('view', 'Dashboard', {
            organizationUuid: member.organizationUuid,
            isPrivate: false,
        });
        can('view', 'SavedChart', {
            organizationUuid: member.organizationUuid,
            isPrivate: false,
        });
        can('view', 'Dashboard', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('view', 'SavedChart', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('view', 'Space', {
            organizationUuid: member.organizationUuid,
            isPrivate: false,
        });
        can('view', 'Space', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('view', 'Project', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Organization', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'ExportCsv', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'DashboardComments', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'Tags', {
            organizationUuid: member.organizationUuid,
        });
    },
    interactive_viewer(member, { can }) {
        applyOrganizationMemberStaticAbilities.viewer(member, { can });
        can('create', 'Job');
        can('view', 'Job', { userUuid: member.userUuid });
        can('view', 'UnderlyingData', {
            organizationUuid: member.organizationUuid,
        });
        can('view', 'SemanticViewer', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'ChangeCsvResults', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Explore', {
            organizationUuid: member.organizationUuid,
        });
        can('create', 'ScheduledDeliveries', {
            organizationUuid: member.organizationUuid,
        });
        can('create', 'DashboardComments', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Dashboard', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('manage', 'SavedChart', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });

        can('manage', 'SemanticViewer', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('manage', 'Dashboard', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            },
        });
        can('manage', 'SavedChart', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            },
        });

        can('manage', 'Space', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            },
        });
    },
    editor(member, { can }) {
        applyOrganizationMemberStaticAbilities.interactive_viewer(member, {
            can,
        });
        can('manage', 'Space', {
            organizationUuid: member.organizationUuid,
            isPrivate: false,
        });
        can('create', 'Space', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Job');
        can('manage', 'PinnedItems', {
            organizationUuid: member.organizationUuid,
        });
        can('update', 'Project', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'ScheduledDeliveries', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'DashboardComments', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'SemanticViewer', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Tags', {
            organizationUuid: member.organizationUuid,
        });
    },
    developer(member, { can }) {
        applyOrganizationMemberStaticAbilities.editor(member, { can });
        can('manage', 'VirtualView', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'CustomSql', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'SqlRunner', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Validation', {
            organizationUuid: member.organizationUuid,
        });
        can('promote', 'SavedChart', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('promote', 'Dashboard', {
            organizationUuid: member.organizationUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('manage', 'CompileProject', {
            organizationUuid: member.organizationUuid,
        });
        can('create', 'Project', {
            organizationUuid: member.organizationUuid,
            type: ProjectType.PREVIEW,
        });

        can('delete', 'Project', {
            organizationUuid: member.organizationUuid,
            type: ProjectType.PREVIEW,
        });
    },
    admin(member, { can }) {
        applyOrganizationMemberStaticAbilities.developer(member, { can });
        can('manage', 'Dashboard', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Space', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'SavedChart', {
            organizationUuid: member.organizationUuid,
        });
        can('create', 'Project', {
            organizationUuid: member.organizationUuid,
            type: { $in: [ProjectType.DEFAULT, ProjectType.PREVIEW] },
        });
        can('delete', 'Project', {
            organizationUuid: member.organizationUuid,
        });
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
        can('manage', 'PinnedItems', {
            organizationUuid: member.organizationUuid,
        });
        can('manage', 'Group', {
            organizationUuid: member.organizationUuid,
        });
    },
};

export type OrganizationMemberAbilitiesArgs = {
    role: OrganizationMemberRole;
    member: Pick<OrganizationMemberProfile, 'organizationUuid' | 'userUuid'>;
    builder: Pick<AbilityBuilder<MemberAbility>, 'can'>;
    permissionsConfig: {
        pat: {
            enabled: boolean;
            allowedOrgRoles: OrganizationMemberRole[];
        };
    };
};

export default function applyOrganizationMemberAbilities({
    role,
    member,
    builder,
    permissionsConfig,
}: OrganizationMemberAbilitiesArgs) {
    applyOrganizationMemberStaticAbilities[role](member, builder);
    applyOrganizationMemberDynamicAbilities({
        role,
        member,
        builder,
        permissionsConfig,
    });
}
