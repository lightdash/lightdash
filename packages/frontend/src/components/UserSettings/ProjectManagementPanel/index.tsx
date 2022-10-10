import {
    Button,
    ButtonGroup,
    Classes,
    Dialog,
    H5,
    Intent,
} from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { OrganizationProject, ProjectType } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
    deleteLastProject,
    getLastProject,
    useDeleteProjectMutation,
    useProjects,
} from '../../../hooks/useProjects';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
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
                        href={`/projects/${projectUuid}/settings`}
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
    const { data, isError, isLoading } = useProjects({
        retry: false,
        onError: ({ error }) => {
            if (error.statusCode === 404) {
                history.push('/createProject');
            }
        },
    });
    const lastProjectUuid = getLastProject();

    const lastProject = data?.find(
        (project) => project.projectUuid === lastProjectUuid,
    );

    if (isLoading || !data) return null;

    return (
        <ProjectManagementPanelWrapper>
            <HeaderActions>
                <H5>Project management settings</H5>
                <Can I="create" a="Project">
                    <Button
                        intent="primary"
                        onClick={() => history.push(`/createProject`)}
                        text="Create new"
                    />
                </Can>
            </HeaderActions>

            {!isError &&
                data.length > 0 &&
                data.map((project) => (
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
