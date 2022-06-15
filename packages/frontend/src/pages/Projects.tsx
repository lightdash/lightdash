import { NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect, useParams } from 'react-router-dom';
import { getLastProject, useProjects } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';

export const Projects: FC = () => {
    const params = useParams<{ projectUuid: string | undefined }>();
    const { isLoading, data, error } = useProjects();

    const { user } = useApp();
    if (user.data?.ability?.cannot('view', 'Project')) {
        // A member role might not have access to view all projects, so we redirect him to /createProject
        // where he can create his own project or invite users
        return <Redirect to={`/createProject`} />;
    }

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Unexpected error"
                    description={error.error.message}
                />
            </div>
        );
    }
    if (!data || data.length <= 0) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="No projects found"
                    description="Please contact support"
                />
            </div>
        );
    }

    const availableProjectUuids = data.map(({ projectUuid }) => projectUuid);
    const find = (projectUuid: string | undefined) => {
        return projectUuid && availableProjectUuids.includes(projectUuid)
            ? projectUuid
            : undefined;
    };
    const lastProject = getLastProject();
    const projectUuid =
        find(params.projectUuid) ||
        find(lastProject) ||
        availableProjectUuids[0];

    return <Redirect to={`/projects/${projectUuid}/home`} />;
};
