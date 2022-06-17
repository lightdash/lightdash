import {
    Button,
    ButtonGroup,
    Classes,
    Dialog,
    H5,
    Intent,
} from '@blueprintjs/core';
import { OrganizationProject } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
    useDeleteProjectMutation,
    useProjects,
} from '../../../hooks/useProjects';
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
}> = ({ isCurrentProject, project: { projectUuid, name } }) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { mutate, isLoading: isDeleting } = useDeleteProjectMutation();
    return (
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
                    <Button
                        icon="delete"
                        outlined
                        text="Delete"
                        intent={Intent.DANGER}
                        style={{ marginLeft: 10 }}
                        onClick={() => setIsDeleteDialogOpen(true)}
                    />
                </ButtonGroup>
            </ItemContent>
            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="delete"
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
                                mutate(projectUuid);
                                if (isCurrentProject) {
                                    window.location.href = '/';
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
    const { data } = useProjects();
    const history = useHistory();
    const params = useParams<{ projectUuid: string }>();

    return (
        <ProjectManagementPanelWrapper>
            <HeaderActions>
                <H5>Project management settings</H5>
                <Button
                    intent="primary"
                    onClick={() => history.push(`/createProject`)}
                    text="Create new"
                />
            </HeaderActions>
            <div>
                {data?.map((project) => (
                    <>
                        <ProjectListItem
                            key={project.projectUuid}
                            isCurrentProject={
                                params.projectUuid === project.projectUuid
                            }
                            project={project}
                        />
                    </>
                ))}
            </div>
        </ProjectManagementPanelWrapper>
    );
};

export default ProjectManagementPanel;
