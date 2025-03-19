import { type AbilityBuilder } from '@casl/ability';
import { type ProjectMemberProfile } from '../types/projectMemberProfile';
import { type ProjectMemberRole } from '../types/projectMemberRole';
import { ProjectType } from '../types/projects';
import { SpaceMemberRole } from '../types/space';
import { type MemberAbility } from './types';

// eslint-disable-next-line import/prefer-default-export
export const projectMemberAbilities: Record<
    ProjectMemberRole,
    (
        member: Pick<ProjectMemberProfile, 'projectUuid' | 'userUuid'>,
        builder: Pick<AbilityBuilder<MemberAbility>, 'can'>,
        groupMemberships?: { groupUuid: string }[],
    ) => void
> = {
    viewer(member, { can }, groupMemberships = []) {
        // Dashboards

        // Viewers can view dashboards in public spaces
        can('view', 'Dashboard', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });

        // Viewers can view dashboards in private spaces if they are invited
        can('view', 'Dashboard', {
            projectUuid: member.projectUuid,
            userSpaceAccess: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });

        // Viewers can view dashboards in private spaces if their group is invited
        can('view', 'Dashboard', {
            projectUuid: member.projectUuid,
            groupSpaceAccess: {
                $elemMatch: {
                    groupUuid: {
                        $in: groupMemberships.map((group) => group.groupUuid),
                    },
                },
            },
        });

        // Charts

        // Viewers can view saved charts in public spaces
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        });

        // Viewers can view saved charts in private spaces if they are invited
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
            userSpaceAccess: {
                $elemMatch: { userUuid: member.userUuid },
            },
        });

        // Viewers can view saved charts in private spaces if their group is invited
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
            groupSpaceAccess: {
                $elemMatch: {
                    groupUuid: {
                        $in: groupMemberships.map((group) => group.groupUuid),
                    },
                },
            },
        });

        // Space

        // Viewers can view public spaces
        can('view', 'Space', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        }).because('Viewers can view all public spaces');

        // Viewers can view private spaces if they are invited
        can('view', 'Space', {
            projectUuid: member.projectUuid,
            userSpaceAccess: {
                $elemMatch: { userUuid: member.userUuid },
            },
        }).because('Viewers can view private spaces they are invited to');

        // Viewers can view private spaces if their group is invited
        can('view', 'Space', {
            projectUuid: member.projectUuid,
            groupSpaceAccess: {
                $elemMatch: {
                    groupUuid: {
                        $in: groupMemberships.map((group) => group.groupUuid),
                    },
                },
            },
        }).because(
            'Viewers can view private spaces their groups are invited to',
        );

        // old permissions for the deprecated access field
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
        can('view', 'Tags', {
            projectUuid: member.projectUuid,
        });
        can('view', 'MetricsTree', {
            projectUuid: member.projectUuid,
        });
        can('view', 'SpotlightTableConfig', {
            projectUuid: member.projectUuid,
        });
    },
    interactive_viewer(member, { can }, groupMemberships = []) {
        projectMemberAbilities.viewer(member, { can }, groupMemberships);
        can('view', 'UnderlyingData', {
            projectUuid: member.projectUuid,
        });
        can('view', 'SemanticViewer', {
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

        // Semantic viewer

        // Can use the semantic viewer
        can('view', 'SemanticViewer', {
            projectUuid: member.projectUuid,
        });

        // Dashboards

        // Interactive viewers can manage dashboards in private spaces if they are invited
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
            userSpaceAccess: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: {
                        $in: [SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN],
                    },
                },
            },
        }).because(
            'Interactive viewers can manage dashboards in private spaces if they are invited',
        );

        // Interactive viewers can manage dashboards in private spaces if their group is invited
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
            groupSpaceAccess: {
                $elemMatch: {
                    groupUuid: {
                        $in: groupMemberships.map((group) => group.groupUuid),
                    },
                    role: {
                        $in: [SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN],
                    },
                },
            },
        }).because(
            'Interactive viewers can manage dashboards in private spaces if their groups are invited',
        );

        // Charts

        // Interactive viewers can manage saved charts in private spaces if they are invited
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
            userSpaceAccess: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: {
                        $in: [SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN],
                    },
                },
            },
        });

        // Interactive viewers can manage saved charts in private spaces if their group is invited
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
            groupSpaceAccess: {
                $elemMatch: {
                    groupUuid: {
                        $in: groupMemberships.map((group) => group.groupUuid),
                    },
                    role: {
                        $in: [SpaceMemberRole.EDITOR, SpaceMemberRole.ADMIN],
                    },
                },
            },
        });

        // Spaces

        // Interactive viewers can manage private spaces if they are invited as admin
        can('manage', 'Space', {
            projectUuid: member.projectUuid,
            userSpaceAccess: {
                $elemMatch: {
                    userUuid: member.userUuid,
                    role: SpaceMemberRole.ADMIN,
                },
            },
        });

        // Interactive viewers can manage private spaces if their group is invited as admin
        can('manage', 'Space', {
            projectUuid: member.projectUuid,
            groupSpaceAccess: {
                $elemMatch: {
                    groupUuid: {
                        $in: groupMemberships.map((group) => group.groupUuid),
                    },
                    role: SpaceMemberRole.ADMIN,
                },
            },
        }).because(
            'Interactive viewers can manage private spaces if their groups are invited as admin',
        );

        // old permissions for the deprecated access field
        can('manage', 'Dashboard', {
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
                    role: SpaceMemberRole.EDITOR,
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
    editor(member, { can }, groupMemberships = []) {
        projectMemberAbilities.interactive_viewer(
            member,
            { can },
            groupMemberships,
        );
        can('create', 'Space', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Space', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        }).because('Project editors can manage public spaces');
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        }).because('Project editors can manage dashboards in public spaces');
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
            isPrivate: false,
        }).because('Project editors can manage saved charts in public spaces');
        can('manage', 'Job');
        can('manage', 'PinnedItems', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'ScheduledDeliveries', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'DashboardComments', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Tags', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'MetricsTree', {
            projectUuid: member.projectUuid,
        });
    },
    developer(member, { can }, groupMemberships = []) {
        projectMemberAbilities.editor(member, { can }, groupMemberships);
        can('manage', 'VirtualView', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'CustomSql', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'SqlRunner', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'Validation', {
            projectUuid: member.projectUuid,
        });

        can('manage', 'CompileProject', {
            projectUuid: member.projectUuid,
        });

        can('delete', 'Project', {
            type: ProjectType.PREVIEW,
            createdByUserUuid: member.userUuid,
        });

        can('create', 'Project', {
            upstreamProjectUuid: member.projectUuid,
            type: ProjectType.PREVIEW,
        });

        can('update', 'Project', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'SpotlightTableConfig', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'ContentAsCode', {
            projectUuid: member.projectUuid,
        });
    },
    admin(member, { can }, groupMemberships = []) {
        projectMemberAbilities.developer(member, { can }, groupMemberships);

        can('delete', 'Project', {
            projectUuid: member.projectUuid,
        });

        can('manage', 'Project', {
            projectUuid: member.projectUuid,
        });

        // Can manage all spaces, dashboards and charts
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
