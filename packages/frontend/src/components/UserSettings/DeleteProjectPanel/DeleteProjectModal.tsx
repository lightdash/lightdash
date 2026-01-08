import { Text, TextInput, type ModalProps } from '@mantine-8/core';
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

    return (
        <MantineModal
            opened={opened}
            onClose={handleOnClose}
            title="Delete Project"
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
