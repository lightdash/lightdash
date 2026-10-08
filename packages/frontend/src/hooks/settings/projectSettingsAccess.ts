import { subject } from '@casl/ability';
import { SpaceMemberRole, type Project } from '@lightdash/common';
import { type UserWithAbility } from '../user/useUser';

const CONTENT_SUBJECTS = ['SavedChart', 'Dashboard', 'Document'] as const;

/**
 * Whether the user holds any rule that could let them create content in
 * this project: tried against a space they would edit, since the roles
 * that create content (editors, interactive viewers, custom roles with a
 * `@space` scope) are gated on space access. Viewers hold no such rule,
 * so nothing is fetched on their behalf; for everyone else the project's
 * real spaces decide (`useCreateInAnySpaceAccess`).
 */
export const mayCreateContent = ({
    ability,
    userUuid,
    project,
}: {
    ability: UserWithAbility['ability'];
    userUuid: string;
    project: Pick<Project, 'organizationUuid' | 'projectUuid'>;
}): boolean =>
    CONTENT_SUBJECTS.some((contentSubject) =>
        ability.can(
            'create',
            subject(contentSubject, {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
                access: [{ userUuid, role: SpaceMemberRole.EDITOR }],
            }),
        ),
    );

export type LimitedProjectSettingsPage = 'validator' | 'recentlyDeleted';

export type ProjectSettingsAccess =
    | { type: 'full'; defaultPage: 'settings' }
    | {
          type: 'limited';
          pages: LimitedProjectSettingsPage[];
          defaultPage: LimitedProjectSettingsPage;
      }
    | { type: 'none'; defaultPage: null };

export const getProjectSettingsAccess = ({
    ability,
    project,
    isTrainingCopy,
    isSoftDeleteEnabled,
    canCreateContentInAnySpace,
}: {
    ability: UserWithAbility['ability'] | undefined;
    project: Pick<Project, 'organizationUuid' | 'projectUuid'> | undefined;
    isTrainingCopy: boolean;
    isSoftDeleteEnabled: boolean;
    canCreateContentInAnySpace: boolean;
}): ProjectSettingsAccess => {
    if (!ability || !project) return { type: 'none', defaultPage: null };
    // A fresh object per check: `subject` tags the object with its type.
    const scope = () => ({
        organizationUuid: project.organizationUuid,
        projectUuid: project.projectUuid,
    });
    if (ability.can('update', subject('Project', scope())))
        return { type: 'full', defaultPage: 'settings' };

    const pages: LimitedProjectSettingsPage[] = [];
    if (isTrainingCopy && ability.can('manage', subject('Validation', scope())))
        pages.push('validator');
    if (
        isSoftDeleteEnabled &&
        (canCreateContentInAnySpace ||
            ability.can('manage', subject('DeletedContent', scope())))
    )
        pages.push('recentlyDeleted');

    const defaultPage = pages[0];
    return defaultPage
        ? { type: 'limited', pages, defaultPage }
        : { type: 'none', defaultPage: null };
};
