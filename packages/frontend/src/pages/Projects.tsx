import { type FC } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../components/PageSpinner';
import { useActiveProjectUuid } from '../hooks/useActiveProject';

const Projects: FC = () => {
    const { isLoading: isActiveProjectLoading, activeProjectUuid } =
        useActiveProjectUuid();

    // If loading is done and there's no active project, user has no projects
    if (!isActiveProjectLoading && !activeProjectUuid) {
        return <Navigate to="/no-access" />;
    }

    if (isActiveProjectLoading || !activeProjectUuid) {
        return <PageSpinner />;
    }

    return <Navigate to={`/projects/${activeProjectUuid}/home`} />;
};

export default Projects;
