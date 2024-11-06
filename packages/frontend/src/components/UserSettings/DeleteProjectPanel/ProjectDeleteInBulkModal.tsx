import { ProjectType, type OrganizationProject } from '@lightdash/common';
import {
    Button,
    Group,
    List,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useDeleteActiveProjectMutation } from '../../../hooks/useActiveProject';
import { useDeleteProjectMutation } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projects: OrganizationProject[];
    currentProjectUuid: string | null;
};

const CONFIRMATION_TEXT = 'delete';

export const ProjectDeleteInBulkModal: FC<Props> = ({
    projects,
    currentProjectUuid,
    opened,
    onClose,
}) => {
    const { mutateAsync: deleteProject, isLoading: isDeleting } =
        useDeleteProjectMutation();
    const { mutateAsync: deleteActiveProject, isLoading: isDeletingActive } =
        useDeleteActiveProjectMutation();

    const [confirmationText, setConfirmationText] = useState('');

    const handleConfirm = async () => {
        if (
            confirmationText.toLowerCase() !== CONFIRMATION_TEXT.toLowerCase()
        ) {
            return;
        }

        for (const project of projects) {
            await deleteProject(project.projectUuid);

            if (project.projectUuid === currentProjectUuid) {
                await deleteActiveProject();
            }
        }

        onClose();
    };

    const handleOnClose = () => {
        setConfirmationText('');
        onClose();
    };

    const statsText = useMemo(() => {
        let texts = [];

        const currentProject = projects.find(
            (p) => p.projectUuid === currentProjectUuid,
        );
        if (currentProject) {
            texts.push(
                <>
                    Active{' '}
                    {currentProject.type === ProjectType.PREVIEW
                        ? `preview `
                        : ''}
                    project{' '}
                    <Text span fw={500}>
                        "{currentProject.name}"
                    </Text>
                </>,
            );
        }

        const regularProjects = projects.filter(
            (p) =>
                p.type === ProjectType.DEFAULT &&
                p.projectUuid !== currentProjectUuid,
        );
        if (regularProjects.length > 0) {
            texts.push(
                <>
                    <Text span fw={500}>
                        {regularProjects.length}
                    </Text>{' '}
                    {regularProjects.length === 1 ? 'project' : 'projects'}
                </>,
            );
        }

        const previewProjects = projects.filter(
            (p) =>
                p.type === ProjectType.PREVIEW &&
                p.projectUuid !== currentProjectUuid,
        );
        if (previewProjects.length > 0) {
            texts.push(
                <>
                    <Text span fw={500}>
                        {previewProjects.length}
                    </Text>

                    {previewProjects.length === 1
                        ? ' preview project'
                        : ' preview projects'}
                </>,
            );
        }

        return texts;
    }, [projects, currentProjectUuid]);

    return (
        <Modal
            size="md"
            opened={opened}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>Delete projects in bulk</Title>
                </Group>
            }
            onClose={handleOnClose}
        >
            <Stack>
                <Stack spacing="sm">
                    <Text>You are about to delete:</Text>

                    <List size="sm">
                        {statsText.map((text, index) => (
                            <List.Item key={index}>{text}</List.Item>
                        ))}
                    </List>

                    <Text>
                        Type in{' '}
                        <Text span fw={500}>
                            "{CONFIRMATION_TEXT}"
                        </Text>{' '}
                        to confirm. This action is not reversible.
                    </Text>
                </Stack>

                <TextInput
                    placeholder={CONFIRMATION_TEXT}
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                />

                <Group position="right" spacing="xs">
                    <Button variant="outline" onClick={handleOnClose}>
                        Cancel
                    </Button>

                    <Button
                        color="red"
                        disabled={
                            confirmationText.toLowerCase() !==
                            CONFIRMATION_TEXT.toLowerCase()
                        }
                        loading={isDeleting || isDeletingActive}
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
