import { Button, ButtonGroup, Card, Classes } from '@blueprintjs/core';
import { OrganizationProject } from 'common';
import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { useProjects } from '../../../hooks/useProjects';
import LinkButton from '../../common/LinkButton';
import { HeaderActions, Wrapper } from './ProjectManagementPanel.styles';

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
    const history = useHistory();
    return (
        <Wrapper>
            <HeaderActions>
                <Button
                    intent="primary"
                    onClick={() => history.push(`/createProject`)}
                    text="Create new"
                />
            </HeaderActions>
            <div>
                {data?.map((project) => (
                    <ProjectListItem
                        key={project.projectUuid}
                        project={project}
                    />
                ))}
            </div>
        </Wrapper>
    );
};

export default ProjectManagementPanel;
