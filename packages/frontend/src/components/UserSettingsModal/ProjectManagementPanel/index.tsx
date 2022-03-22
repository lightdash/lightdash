import { Button, ButtonGroup, Classes, Intent } from '@blueprintjs/core';
import { OrganizationProject } from 'common';
import React, { FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useProjects } from '../../../hooks/useProjects';
import LinkButton from '../../common/LinkButton';
import {
    HeaderActions,
    ItemContent,
    ProjectInfo,
    ProjectListItemWrapper,
    ProjectManagementPanelWrapper,
    ProjectName,
    ProjectTag,
} from './ProjectManagementPanel.styles';

const ProjectListItem: FC<{
    isCurrentProject: boolean;
    project: OrganizationProject;
}> = ({ isCurrentProject, project: { projectUuid, name } }) => (
    <ProjectListItemWrapper elevation={0}>
        <ItemContent>
            <ProjectInfo>
                <ProjectName className={Classes.TEXT_OVERFLOW_ELLIPSIS}>
                    {name}
                </ProjectName>
                {isCurrentProject && (
                    <ProjectTag minimal>Current Project</ProjectTag>
                )}
            </ProjectInfo>
            <ButtonGroup>
                <LinkButton
                    icon="cog"
                    outlined
                    text="Settings"
                    href={`/projects/${projectUuid}/settings`}
                />
                <LinkButton
                    icon="trash"
                    outlined
                    text="Delete"
                    intent={Intent.DANGER}
                    style={{ marginLeft: 10 }}
                    href={`#`}
                />
            </ButtonGroup>
        </ItemContent>
    </ProjectListItemWrapper>
);

const ProjectManagementPanel: FC = () => {
    const { data } = useProjects();
    const history = useHistory();
    const params = useParams<{ projectUuid: string | undefined }>();
    return (
        <ProjectManagementPanelWrapper>
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
                        isCurrentProject={
                            params.projectUuid === project.projectUuid
                        }
                        project={project}
                    />
                ))}
            </div>
        </ProjectManagementPanelWrapper>
    );
};

export default ProjectManagementPanel;
