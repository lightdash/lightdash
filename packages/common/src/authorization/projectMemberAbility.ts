import { Ability, AbilityBuilder, ForcedSubject } from '@casl/ability';
import {
    ProjectMemberProfile,
    ProjectMemberRole,
} from '../types/projectMemberProfile';

type Action = 'manage' | 'update' | 'view' | 'create' | 'delete';

interface Project {
    projectUuid: string;
}

type Subject = Project | 'Dashboard' | 'SavedChart' | 'Project' | 'Job' | 'all';

type PossibleAbilities = [
    Action,
    Subject | ForcedSubject<Exclude<Subject, 'all'>>,
];

export type ProjectMemberAbility = Ability<PossibleAbilities>;

const projectMemberAbilities: Record<
    ProjectMemberRole,
    (
        member: Pick<ProjectMemberProfile, 'role' | 'projectUuid'>,
        builder: Pick<AbilityBuilder<ProjectMemberAbility>, 'can'>,
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

export const defineAbilityForProjectMember = (
    member: Pick<ProjectMemberProfile, 'role' | 'projectUuid'> | undefined,
): ProjectMemberAbility => {
    const builder = new AbilityBuilder<ProjectMemberAbility>(Ability);
    if (member) {
        projectMemberAbilities[member.role](member, builder);
    }
    return builder.build();
};
