import { FC } from 'react';
import { Redirect } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import PageSpinner from '../components/PageSpinner';
import { useActiveProjectUuid } from '../hooks/useProject';
import { useProjects } from '../hooks/useProjects';

export const Projects: FC = () => {
    const { isLoading, data, error } = useProjects();
    const activeProjectUuid = useActiveProjectUuid();

    if (isLoading) {
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
