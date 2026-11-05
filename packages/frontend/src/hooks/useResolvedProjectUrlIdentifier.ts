import { getProjectUrlIdentifier } from '../utils/projectUrl';
import { useProject } from './useProject';
import { useOptionalProjectRoute } from './useProjectRoute';

/**
 * URL segment for a project by uuid. Works outside ProjectRoute too (navbar
 * menus on AI agent and settings pages), where it fetches the project.
 */
export const useResolvedProjectUrlIdentifier = (projectUuid: string) => {
    const projectRoute = useOptionalProjectRoute();
    const isRouteProject = projectRoute?.projectUuid === projectUuid;
    const { data: project } = useProject(projectUuid, {
        enabled: !isRouteProject,
    });

    if (projectRoute && isRouteProject) {
        return projectRoute.projectUrlIdentifier;
    }

    return project ? getProjectUrlIdentifier(project) : projectUuid;
};
