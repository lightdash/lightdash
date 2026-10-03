import { subject } from '@casl/ability';
import { type Project } from '@lightdash/common';
import { type UserWithAbility } from '../user/useUser';

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
