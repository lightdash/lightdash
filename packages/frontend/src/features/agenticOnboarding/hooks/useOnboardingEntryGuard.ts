import { subject } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useProjects } from '../../../hooks/useProjects';
import useApp from '../../../providers/App/useApp';

export type OnboardingEntryGuardResult = 'loading' | 'allowed' | 'redirect';

/**
 * Plan D8: wizard entry requires `create:Project` AND (for the initial connect
 * step) an org with zero projects. Once a project exists mid-wizard the sub
 * steps only require the create ability.
 */
export const useOnboardingEntryGuard = (
    hasProjectContext: boolean,
): OnboardingEntryGuardResult => {
    const { user } = useApp();
    const { data: organization, isInitialLoading: isOrgLoading } =
        useOrganization();
    const projectsQuery = useProjects();

    if (
        user.isInitialLoading ||
        isOrgLoading ||
        projectsQuery.isInitialLoading
    ) {
        return 'loading';
    }

    const canCreateProject =
        user.data?.ability?.can(
            'create',
            subject('Project', {
                organizationUuid: organization?.organizationUuid,
                type: ProjectType.DEFAULT,
            }),
        ) ?? false;

    if (!canCreateProject) {
        return 'redirect';
    }

    if (hasProjectContext) {
        return 'allowed';
    }

    const hasProjects = (projectsQuery.data?.length ?? 0) > 0;
    return hasProjects ? 'redirect' : 'allowed';
};
