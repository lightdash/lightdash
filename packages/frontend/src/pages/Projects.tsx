import { FC } from 'react';
import { Redirect } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import PageSpinner from '../components/PageSpinner';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useProjects } from '../hooks/useProjects';

const Projects: FC = () => {
    const { isInitialLoading, data, error } = useProjects();
    const { isLoading: isActiveProjectLoading, activeProjectUuid } =
        useActiveProjectUuid();

    if (isInitialLoading || isActiveProjectLoading || !activeProjectUuid) {
        return <PageSpinner />;
    }
    if (error && error.error) {
        return <ErrorState error={error.error} />;
    }
    if (!data || data.length <= 0) {
        return <Redirect to="/no-access" />;
    }

    return <Redirect to={`/projects/${activeProjectUuid}/home`} />;
};

export default Projects;
