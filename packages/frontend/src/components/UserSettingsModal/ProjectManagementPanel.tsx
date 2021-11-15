import { ButtonGroup, Card, Classes } from '@blueprintjs/core';
import { OrganizationProject } from 'common';
import React, { FC } from 'react';
import { useProjects } from '../../hooks/useProjects';
import LinkButton from '../common/LinkButton';

const ProjectListItem: FC<{ project: OrganizationProject }> = ({
    project: { projectUuid, name },
}) => (
    <Card
        elevation={0}
        style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '20px',
        }}
    >
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
            }}
        >
            <p
                style={{
                    margin: 0,
                    marginRight: '10px',
                    flex: 1,
                    fontWeight: 'bold',
                }}
                className={Classes.TEXT_OVERFLOW_ELLIPSIS}
            >
                {name}
            </p>
            <ButtonGroup>
                <LinkButton
                    icon="cog"
                    outlined
                    text="Settings"
                    href={`/projects/${projectUuid}/settings`}
                />
            </ButtonGroup>
        </div>
    </Card>
);

const ProjectManagementPanel: FC = () => {
    const { data } = useProjects();

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <div>
                {data?.map((project) => (
                    <ProjectListItem
                        key={project.projectUuid}
                        project={project}
                    />
                ))}
            </div>
        </div>
    );
};

export default ProjectManagementPanel;
