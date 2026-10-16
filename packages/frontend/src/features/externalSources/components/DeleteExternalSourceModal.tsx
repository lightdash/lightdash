import { type ExternalSourceRef } from '@lightdash/common';
import { Button, Group, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';
import { useDeleteExternalSource } from '../hooks/useExternalSources';

type Props = {
    projectUuid: string;
    sourceRef: ExternalSourceRef;
    tableLabel: string;
    opened: boolean;
    onClose: () => void;
    onDeleted?: () => void;
};

export const DeleteExternalSourceModal: FC<Props> = ({
    projectUuid,
    sourceRef,
    tableLabel,
    opened,
    onClose,
    onDeleted,
}) => {
    const { t } = useTranslation('sync');
    const deleteMutation = useDeleteExternalSource(projectUuid);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('externalSources.delete.title', { table: tableLabel })}
            icon={IconTrash}
            size="md"
        >
            <Stack gap="md">
                <Text fz="sm">{t('externalSources.delete.description')}</Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        {t('actions.cancel', { ns: 'common' })}
                    </Button>
                    <Button
                        color="red"
                        loading={deleteMutation.isLoading}
                        onClick={() =>
                            deleteMutation.mutate(sourceRef.sourceUuid, {
                                onSuccess: () => {
                                    onClose();
                                    onDeleted?.();
                                },
                            })
                        }
                    >
                        {t('actions.delete', { ns: 'common' })}
                    </Button>
                </Group>
            </Stack>
        </MantineModal>
    );
};
