import { subject } from '@casl/ability';
import React, { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import { useProjects } from '../hooks/useProjects';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import PageSpinner from './PageSpinner';

const ProjectRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const { user } = useApp();
    const { projectUuid } = useParams();
    const { data: projects, isInitialLoading, isError, error } = useProjects();

    if (isInitialLoading) {
        return <PageSpinner />;
    }

    if (isError && error) {
        return <ErrorState error={error.error} />;
    }

    if (!projects || projects.length <= 0) {
        return <Navigate to="/no-access" />;
    }

    return (
        <Can
            I="view"
            this={subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            })}
            passThrough
        >
            {(isAllowed) => {
                return isAllowed ? (
                    children
                ) : (
                    <Navigate to="/no-project-access" />
                );
            }}
        </Can>
    );
};

export default ProjectRoute;
