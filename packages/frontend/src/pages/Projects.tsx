import { NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { Redirect, useParams } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';

export const Projects: FC = () => {
    const params = useParams<{ projectUuid: string | undefined }>();
    const { isLoading, data, error } = useProjects();
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
    const projectUuid =
        params.projectUuid && availableProjectUuids.includes(params.projectUuid)
            ? params.projectUuid
            : availableProjectUuids[0];

    return <Redirect to={`/projects/${projectUuid}/home`} />;
};
