import React, { FC, useState } from 'react';
import {
    Callout,
    Card,
    Divider,
    H1,
    H5,
    NonIdealState,
    Spinner,
} from '@blueprintjs/core';
import { ProjectType, ProjectTypeLabels } from 'common';
import { useParams } from 'react-router-dom';
import WarehouseSettingsForm from '../components/WarehouseSettingsForm/WarehouseSettingsForm';
import DbtSettingsForm from '../components/DbtSettingsForm/DbtSettingsForm';
import ProjectStatusCallout from '../components/ProjectStatusCallout';
import { useProject } from '../hooks/useProject';

const ProjectSettings: FC = () => {
    const [type, setType] = useState<ProjectType>();
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
            <H1 style={{ margin: 0, flex: 1 }}>Edit project: {data.name}</H1>
            <Divider style={{ margin: '20px 0' }} />
            <ProjectStatusCallout style={{ marginBottom: '20px' }} />
            <Card
                style={{
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'row',
                }}
                elevation={1}
            >
                <H5 style={{ flex: 1 }}>dbt connection</H5>
                <div style={{ flex: 1 }}>
                    <DbtSettingsForm
                        dbtConnection={data.dbtConnection}
                        onTypeChange={setType}
                    />
                </div>
            </Card>
            <Card
                style={{
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'row',
                }}
                elevation={1}
            >
                <H5 style={{ flex: 1 }}>Warehouse connection</H5>
                <div style={{ flex: 1 }}>
                    {type &&
                    [
                        ProjectType.DBT,
                        ProjectType.GITHUB,
                        ProjectType.GITLAB,
                    ].includes(type) ? (
                        <WarehouseSettingsForm
                            projectUuid={data.projectUuid}
                            warehouseConnection={data.warehouseConnection}
                        />
                    ) : (
                        <Callout
                            intent="primary"
                            title="No configuration needed"
                        >
                            <p>
                                Warehouse connection is managed by{' '}
                                {type
                                    ? ProjectTypeLabels[type]
                                    : 'dbt connection'}
                            </p>
                        </Callout>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default ProjectSettings;
