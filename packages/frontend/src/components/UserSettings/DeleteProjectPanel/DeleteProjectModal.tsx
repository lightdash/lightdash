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
import { useProject } from '../../../hooks/useProject';
import { useDeleteProjectMutation } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';

export const ProjectDeleteModal: FC<
    Pick<ModalProps, 'opened' | 'onClose'> & {
        projectUuid: string;
        onDelete: () => void;
    }
> = ({ opened, onClose, projectUuid, onDelete }) => {
    const { isLoading, data: project } = useProject(projectUuid);
    const { mutateAsync, isLoading: isDeleting } = useDeleteProjectMutation();

    const [confirmOrgName, setConfirmOrgName] = useState<string>();

    if (isLoading || !project) return null;

    const handleConfirm = async () => {
        await mutateAsync(projectUuid);
        onClose();
        onDelete();
    };

    const handleOnClose = () => {
        setConfirmOrgName(undefined);
        onClose();
    };

    return (
        <Modal
            size="md"
            centered
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
                    Type the name of this Project <b>{project.name}</b> to
                    confirm you want to delete this Project and its users. This
                    action is not reversible.
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
