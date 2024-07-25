import { type AbilityBuilder } from '@casl/ability';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type ProjectMemberRole } from '../types/projectMemberRole';
import { SpaceMemberRole } from '../types/space';
import { type MemberAbility } from './types';

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
            access: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
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
            access: {
                $elemMatch: { userUuid: member.userUuid },
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
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            },
        });
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            },
        });
        can('manage', 'Space', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            },
        });
    },
    editor(member, { can }) {
        projectMemberAbilities.interactive_viewer(member, { can });
        can('create', 'Space', {
            projectUuid: member.projectUuid,
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
        can('manage', 'CustomSql', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'SqlRunner', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Validation', {
            projectUuid: member.projectUuid,
        });

        can('promote', 'SavedChart', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('promote', 'Dashboard', {
            projectUuid: member.projectUuid,
            access: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.EDITOR,
                },
            },
        });
        can('manage', 'CompileProject', {
            projectUuid: member.projectUuid,
        });
    },
    admin(member, { can }) {
        projectMemberAbilities.developer(member, { can });
        can('manage', 'Project', {
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
