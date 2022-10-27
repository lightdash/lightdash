import {
    Button,
    ButtonGroup,
    Classes,
    Dialog,
    Intent,
} from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { OrganizationProject, ProjectType } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { Redirect, useHistory } from 'react-router-dom';
import {
    deleteLastProject,
    getLastProject,
    useDeleteProjectMutation,
    useProjects,
} from '../../../hooks/useProjects';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import LinkButton from '../../common/LinkButton';
import { PanelTitle } from '../AccessTokensPanel/AccessTokens.styles';
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
}> = ({ isCurrentProject, project: { projectUuid, name, type } }) => {
    const { user } = useApp();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { mutate: deleteProjectMutation, isLoading: isDeleting } =
        useDeleteProjectMutation();
    return (
        <ProjectListItemWrapper elevation={0}>
            <ItemContent>
                <ProjectInfo>
                    <ProjectName
                        className={Classes.TEXT_OVERFLOW_ELLIPSIS}
                        title={name}
                    >
                        {name}
                    </ProjectName>
                    {isCurrentProject && (
                        <ProjectTag minimal>Current Project</ProjectTag>
                    )}
                    {type === ProjectType.PREVIEW && (
                        <ProjectTag minimal intent="warning">
                            Preview
                        </ProjectTag>
                    )}
                </ProjectInfo>

                <ButtonGroup>
                    <LinkButton
                        icon="cog"
                        outlined
                        text="Settings"
                        href={`/generalSettings/projectManagement/${projectUuid}`}
                    />
                    <Can
                        I="delete"
                        this={subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button
                            icon="trash"
                            outlined
                            text="Delete"
                            intent={Intent.DANGER}
                            style={{ marginLeft: 10 }}
                            onClick={() => setIsDeleteDialogOpen(true)}
                        />
                    </Can>
                </ButtonGroup>
            </ItemContent>

            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="trash"
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title={'Delete project ' + name}
                lazy
                canOutsideClickClose={false}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Are you sure ? This will permanently delete the
                        <b> {name} </b> project.
                    </p>
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            disabled={isDeleting}
                            onClick={() => setIsDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={isDeleting}
                            intent="danger"
                            onClick={() => {
                                deleteProjectMutation(projectUuid);
                                if (isCurrentProject) {
                                    deleteLastProject();
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
        </ProjectListItemWrapper>
    );
};

const ProjectManagementPanel: FC = () => {
    const history = useHistory();
    const { data, isLoading } = useProjects();
    const lastProjectUuid = getLastProject();

    const lastProject = data?.find(
        (project) => project.projectUuid === lastProjectUuid,
    );

    if (isLoading || !data) return null;

    if (data.length === 0) {
        return <Redirect to="/createProject" />;
    }

    return (
        <ProjectManagementPanelWrapper>
            <HeaderActions>
                <PanelTitle>Project management settings</PanelTitle>
                <Can I="create" a="Project">
                    <Button
                        intent="primary"
                        onClick={() => history.push(`/createProject`)}
                        text="Create new"
                    />
                </Can>
            </HeaderActions>

            {data.map((project) => (
                <ProjectListItem
                    key={project.projectUuid}
                    isCurrentProject={
                        lastProject?.projectUuid === project.projectUuid
                    }
                    project={project}
                />
            ))}
        </ProjectManagementPanelWrapper>
    );
};

export default ProjectManagementPanel;
