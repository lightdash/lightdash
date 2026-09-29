import { subject } from '@casl/ability';
import { type Project } from '@lightdash/common';
import { type UserWithAbility } from '../user/useUser';

/**
 * How much of a project's settings a user can open:
 * - `full`: every tab their scopes allow (needs `update:Project`)
 * - `learnerCopy`: a learner in their training copy, who never holds
 *   `update:Project`, sees only the Validator, gated on `manage:Validation`
 *   like the server
 * - `none`: no project settings
 */
export type ProjectSettingsAccess = 'full' | 'learnerCopy' | 'none';

/** The one page a learner copy's settings open on. */
export const LEARNER_COPY_SETTINGS_PAGE = 'validator';

export const getProjectSettingsAccess = ({
    ability,
    project,
    isTrainingCopy,
}: {
    ability: UserWithAbility['ability'] | undefined;
    project: Pick<Project, 'organizationUuid' | 'projectUuid'> | undefined;
    isTrainingCopy: boolean;
}): ProjectSettingsAccess => {
    if (!ability || !project) return 'none';
    // A fresh object per check: `subject` tags the object with its type.
    const scope = () => ({
        organizationUuid: project.organizationUuid,
        projectUuid: project.projectUuid,
    });
    if (ability.can('update', subject('Project', scope()))) return 'full';
    if (isTrainingCopy && ability.can('manage', subject('Validation', scope())))
        return 'learnerCopy';
    return 'none';
};
