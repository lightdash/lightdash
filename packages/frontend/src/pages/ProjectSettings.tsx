import React, { FC } from 'react';
import { Divider, H1, NonIdealState, Spinner } from '@blueprintjs/core';
import { useParams } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { UpdateProjectConnection } from '../components/ProjectConnection';

const ProjectSettings: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data, error } = useProject(projectUuid);

    if (error) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Error loading project"
                    description={error.error.message}
                />
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading project" icon={<Spinner />} />
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '800px',
                margin: '20px auto',
            }}
        >
            <H1 style={{ margin: 0, flex: 1 }}>
                Edit project connection: {data.name}
            </H1>
            <Divider style={{ margin: '20px 0' }} />
            <UpdateProjectConnection projectUuid={projectUuid} />
        </div>
    );
};

export default ProjectSettings;
