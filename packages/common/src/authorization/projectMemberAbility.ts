import { AbilityBuilder } from '@casl/ability';
import {
    ProjectMemberProfile,
    ProjectMemberRole,
} from '../types/projectMemberProfile';
import { MemberAbility } from './types';

// eslint-disable-next-line import/prefer-default-export
export const projectMemberAbilities: Record<
    ProjectMemberRole,
    (
        member: Pick<ProjectMemberProfile, 'role' | 'projectUuid'>,
        builder: Pick<AbilityBuilder<MemberAbility>, 'can'>,
    ) => void
> = {
    viewer(member, { can }) {
        can('view', 'Dashboard', {
            projectUuid: member.projectUuid,
        });
        can('view', 'SavedChart', {
            projectUuid: member.projectUuid,
        });
        can('view', 'Project', {
            projectUuid: member.projectUuid,
        });
    },
    editor(member, { can }) {
        projectMemberAbilities.viewer(member, { can });
        can('manage', 'Dashboard', {
            projectUuid: member.projectUuid,
        });
        can('manage', 'SavedChart', {
            projectUuid: member.projectUuid,
        });

        can('manage', 'Job');
    },
    admin(member, { can }) {
        projectMemberAbilities.editor(member, { can });
        can('manage', 'Project', {
            projectUuid: member.projectUuid,
        });
    },
};
