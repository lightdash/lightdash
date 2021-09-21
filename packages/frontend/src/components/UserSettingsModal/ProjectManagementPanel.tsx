import React, { FC } from 'react';
import { OrganizationProject } from 'common';
import { Card, Classes, Button, ButtonGroup } from '@blueprintjs/core';
import { useHistory } from 'react-router-dom';
import { useProjects } from '../../hooks/useProjects';

const ProjectListItem: FC<{ project: OrganizationProject }> = ({
    project: { projectUuid, name },
}) => {
    const history = useHistory();
    return (
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
                    <Button
                        rightIcon="edit"
                        outlined
                        text="Edit"
                        onClick={() => {
                            history.push({
                                pathname: `/projects/${projectUuid}/settings`,
                            });
                        }}
                    />
                    <Button
                        rightIcon="chevron-right"
                        outlined
                        text="Set active"
                        onClick={() => {
                            history.push({
                                pathname: `/projects/${projectUuid}`,
                            });
                        }}
                    />
                </ButtonGroup>
            </div>
        </Card>
    );
};

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
