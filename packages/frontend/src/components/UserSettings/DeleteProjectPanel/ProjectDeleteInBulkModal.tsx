import { ProjectType, type OrganizationProject } from '@lightdash/common';
import { List, Text, TextInput, type ModalProps } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDeleteActiveProjectMutation } from '../../../hooks/useActiveProject';
import { useDeleteProjectMutation } from '../../../hooks/useProjects';
import MantineModal from '../../common/MantineModal';

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
    const { t } = useTranslation('userSettings');
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
        const bold = { bold: <Text span fw={500} /> };

        const currentProject = projects.find(
            (p) => p.projectUuid === currentProjectUuid,
        );
        if (currentProject) {
            texts.push(
                <Trans
                    t={t}
                    i18nKey={
                        currentProject.type === ProjectType.PREVIEW
                            ? 'deleteProjectPanel.bulkModal.activePreviewProject'
                            : 'deleteProjectPanel.bulkModal.activeProject'
                    }
                    values={{ name: currentProject.name }}
                    components={bold}
                />,
            );
        }

        const regularProjects = projects.filter(
            (p) =>
                p.type === ProjectType.DEFAULT &&
                p.projectUuid !== currentProjectUuid,
        );
        if (regularProjects.length > 0) {
            texts.push(
                <Trans
                    t={t}
                    i18nKey="deleteProjectPanel.bulkModal.projectCount"
                    count={regularProjects.length}
                    components={bold}
                />,
            );
        }

        const previewProjects = projects.filter(
            (p) =>
                p.type === ProjectType.PREVIEW &&
                p.projectUuid !== currentProjectUuid,
        );
        if (previewProjects.length > 0) {
            texts.push(
                <Trans
                    t={t}
                    i18nKey="deleteProjectPanel.bulkModal.previewProjectCount"
                    count={previewProjects.length}
                    components={bold}
                />,
            );
        }

        return texts;
    }, [projects, currentProjectUuid, t]);

    return (
        <MantineModal
            opened={opened}
            onClose={handleOnClose}
            title={t('deleteProjectPanel.bulkModal.title')}
            variant="delete"
            resourceType="projects"
            size="md"
            onConfirm={handleConfirm}
            confirmDisabled={
                confirmationText.toLowerCase() !==
                CONFIRMATION_TEXT.toLowerCase()
            }
            confirmLoading={isDeleting || isDeletingActive}
        >
            <Text fz="sm">
                {t('deleteProjectPanel.bulkModal.aboutToDelete')}
            </Text>

            <List size="sm">
                {statsText.map((text, index) => (
                    <List.Item key={index}>{text}</List.Item>
                ))}
            </List>

            <Text fz="sm" c="dimmed">
                <Trans
                    t={t}
                    i18nKey="deleteProjectPanel.bulkModal.typeToConfirm"
                    values={{ text: CONFIRMATION_TEXT }}
                    components={{ bold: <Text span fw={500} /> }}
                />
            </Text>

            <TextInput
                placeholder={CONFIRMATION_TEXT}
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
            />
        </MantineModal>
    );
};
