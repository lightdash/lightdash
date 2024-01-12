import {
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useDeleteActiveProjectMutation } from '../../../hooks/useActiveProject';
import { useProject } from '../../../hooks/useProject';
import { useDeleteProjectMutation } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';

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
        <Modal
            size="md"
            opened={opened}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>Delete Project</Title>
                </Group>
            }
            onClose={handleOnClose}
        >
            <Stack>
                <Text>
                    Type the name of this project{' '}
                    <Text span fw={600}>
                        {project.name}
                    </Text>{' '}
                    to confirm you want to delete this project and its users.
                    This action is not reversible.
                </Text>

                <TextInput
                    name="confirmOrgName"
                    placeholder={project.name}
                    value={confirmOrgName}
                    onChange={(e) => setConfirmOrgName(e.target.value)}
                />

                <Group position="right" spacing="xs">
                    <Button variant="outline" onClick={handleOnClose}>
                        Cancel
                    </Button>

                    <Button
                        color="red"
                        disabled={
                            confirmOrgName?.toLowerCase() !==
                            project.name.toLowerCase()
                        }
                        loading={isDeleting}
                        onClick={() => handleConfirm()}
                        type="submit"
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
