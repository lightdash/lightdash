import React, { FC } from 'react';
import { Button } from '@blueprintjs/core';
import { Redirect, useHistory } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';

export const Projects: FC = () => {
    const { isLoading, data, error } = useProjects();
    const history = useHistory();
    if (data === undefined) {
        if (isLoading) {
            return <div>Loading...</div>;
        }
        if (error) {
            return <div>Error: ${error}</div>;
        }
        return <div>Idle?</div>;
    }
    if (data.length === 1) {
        return <Redirect to={`/projects/${data[0].projectUuid}/tables`} />;
    }

    // TODO: Improve design when multiple projects to choose from
    return (
        <div>
            {data.map((project) => (
                <Button
                    key={project.projectUuid}
                    onClick={() => {
                        history.push({
                            pathname: `/projects/${project.projectUuid}/tables`,
                        });
                    }}
                >
                    {project.name}
                </Button>
            ))}
        </div>
    );
};
