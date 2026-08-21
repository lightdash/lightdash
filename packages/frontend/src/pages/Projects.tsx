import { type FC } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../components/PageSpinner';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useProject } from '../hooks/useProject';
import { getProjectUrlIdentifier } from '../utils/projectUrl';

const Projects: FC = () => {
    const { isLoading: isActiveProjectLoading, activeProjectUuid } =
        useActiveProjectUuid();
    const activeProjectQuery = useProject(activeProjectUuid);

    // If loading is done and there's no active project, user has no projects
    if (!isActiveProjectLoading && !activeProjectUuid) {
        return <Navigate to="/no-access" />;
    }

    if (
        isActiveProjectLoading ||
        activeProjectQuery.isInitialLoading ||
        !activeProjectUuid
    ) {
        return <PageSpinner />;
    }

    const projectUrlIdentifier = activeProjectQuery.data
        ? getProjectUrlIdentifier(activeProjectQuery.data)
        : activeProjectUuid;

    return <Navigate to={`/projects/${projectUrlIdentifier}/home`} />;
};

export default Projects;
