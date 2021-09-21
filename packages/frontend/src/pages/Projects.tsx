import React, { FC } from 'react';
import { Redirect } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';

export const Projects: FC = () => {
    const { isLoading, data, error } = useProjects();
    if (data === undefined) {
        if (isLoading) {
            return <div>Loading...</div>;
        }
        if (error) {
            return <div>Error: ${error}</div>;
        }
        return <div>Idle?</div>;
    }
    if (data.length === 0) {
        return <div>No project found!</div>;
    }
    return <Redirect to={`/projects/${data[0].projectUuid}/tables`} />;
};
