import { AbilityBuilder } from '@casl/ability';
import { ProjectMemberProfile } from '../types/projectMemberProfile';
import { ProjectMemberRole } from '../types/projectMemberRole';
import { SpaceMemberRole } from '../types/space';
import { MemberAbility } from './types';

// eslint-disable-next-line import/prefer-default-export
export const projectMemberAbilities: Record<
    ProjectMemberRole,
    (
        member: Pick<ProjectMemberProfile, 'role' | 'projectUuid' | 'userUuid'>,
        builder: Pick<AbilityBuilder<MemberAbility>, 'can'>,
    ) => void
> = {
    viewer(member, { can }) {
        can('view', 'Dashboard', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });
        can('view', 'Dashboard', {
            projectUuid: member.projectUuid,
            isPrivate: true,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
            isPrivate: true,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('view', 'Space', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });
        can('view', 'Space', {
            projectUuid: member.projectUuid,
            isPrivate: true,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('manage', 'Space', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('view', 'Project', {
            projectUuid: member.projectUuid,
        });
        can('view', 'PinnedItems', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'ExportCsv', {
            projectUuid: member.projectUuid,
        });
        can('view', 'DashboardComments', {
            projectUuid: member.projectUuid,
        });
    },
    interactive_viewer(member, { can }) {
        projectMemberAbilities.viewer(member, { can });
        can('view', 'UnderlyingData', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Explore', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'ChangeCsvResults', {
            projectUuid: member.projectUuid,
        });
        can('create', 'ScheduledDeliveries', {
            projectUuid: member.projectUuid,
        });
        can('create', 'DashboardComments', {
            projectUuid: member.projectUuid,
        });
    },
    editor(member, { can }) {
        projectMemberAbilities.interactive_viewer(member, { can });
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });
        can('manage', 'Space', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
            isPrivate: true,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
            isPrivate: true,
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('manage', 'Job');
        can('manage', 'PinnedItems', {
            projectUuid: member.projectUuid,
        });
        can('update', 'Project', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'ScheduledDeliveries', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'DashboardComments', {
            projectUuid: member.projectUuid,
        });
    },
    developer(member, { can }) {
        projectMemberAbilities.editor(member, { can });
        can('manage', 'SqlRunner', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Validation', {
            projectUuid: member.projectUuid,
        });
    },
    admin(member, { can }) {
        projectMemberAbilities.developer(member, { can });
        can('manage', 'Project', {
            projectUuid: member.projectUuid,
        });
        can('view', 'Space', {
            projectUuid: member.projectUuid,
        });
        can('view', 'Dashboard', {
            projectUuid: member.projectUuid,
        });
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Space', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
        });
    },
};
