import { ProjectType } from '@lightdash/common';
import { Text, TextInput, type ModalProps } from '@mantine/core';
import { useState, type FC } from 'react';
import { useDeleteActiveProjectMutation } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import { useDeleteProjectMutation } from '../../../hooks/useProjects';
import MantineModal from '../../common/MantineModal';

export const ProjectDeleteModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
        projectUuid: string;
        isCurrentProject: boolean;
    }
> = ({ opened, onClose, projectUuid, isCurrentProject }) => {
    const { isInitialLoading, data: project } = useProject(projectUuid);
    const { mutateAsync, isLoading: isDeleting } = useDeleteProjectMutation();
    const { mutate: deleteActiveProjectMutation } =
        useDeleteActiveProjectMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isInitialLoading || !project) return null;

    const handleConfirm = async () => {
        await mutateAsync(projectUuid);
        if (isCurrentProject) {
            deleteActiveProjectMutation();
        }
        onClose();
    };

    const handleOnClose = () => {
        setConfirmOrgName(undefined);
        onClose();
    };

    const isPlayground = project.type === ProjectType.TRAINING;

    return (
        <MantineModal
            opened={opened}
            onClose={handleOnClose}
            title={
                isPlayground ? 'Delete training playground' : 'Delete Project'
            }
            variant="delete"
            resourceType="project"
            resourceLabel={project.name}
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmOrgName?.toLowerCase() !== project.name.toLowerCase()
            }
            confirmLoading={isDeleting}
        >
            {isPlayground && (
                <Text fz="sm">
                    This is the training playground Learn created for your
                    organization. Deleting it removes every learner's copy with
                    it, and Learn goes back to asking an admin to enable it.
                </Text>
            )}
            <Text fz="sm" c="dimmed">
                Type the name of this project to confirm. This action is not
                reversible.
            </Text>

            <TextInput
                name="confirmOrgName"
                placeholder={project.name}
                value={confirmOrgName}
                onChange={(e) => setConfirmOrgName(e.target.value)}
            />
        </MantineModal>
    );
};
