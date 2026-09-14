import { type ExternalSourceRef } from '@lightdash/common';
import { Button, Group, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
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
    const deleteMutation = useDeleteExternalSource(projectUuid);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`Delete ${tableLabel}`}
            icon={IconTrash}
            size="md"
        >
            <Stack gap="md">
                <Text fz="sm">
                    This permanently removes the table and its uploaded data.
                    Charts built on it will stop working.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
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
                        Delete
                    </Button>
                </Group>
            </Stack>
        </MantineModal>
    );
};
