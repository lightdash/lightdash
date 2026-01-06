import {
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, type FC } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useScheduler } from '../hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../hooks/useSchedulersDeleteMutation';

interface SchedulerDeleteModalProps extends ModalProps {
    schedulerUuid: string;
    onConfirm: () => void;
}

export const SchedulerDeleteModal: FC<SchedulerDeleteModalProps> = ({
    schedulerUuid,
    onConfirm,
    onClose,
    opened,
}) => {
    const scheduler = useScheduler(schedulerUuid);
    const mutation = useSchedulersDeleteMutation();

    useEffect(() => {
        if (mutation.isSuccess) {
            onConfirm();
        }
    }, [mutation.isSuccess, onConfirm]);

    const handleConfirm = useCallback(() => {
        mutation.mutate(schedulerUuid);
    }, [mutation, schedulerUuid]);

    return (
        <Modal
            opened={opened}
            zIndex={getDefaultZIndex('popover')}
            title={
                <Group gap="xs">
                    <MantineIcon icon={IconTrash} size="lg" color="red" />
                    <Text fw={600}>Delete scheduled delivery</Text>
                </Group>
            }
            onClose={onClose}
        >
            <Stack gap="lg">
                <Box>
                    {scheduler.isInitialLoading ? (
                        <Stack h={300} w="100%" align="center">
                            <Text fw={600}>Loading scheduler</Text>
                            <Loader />
                        </Stack>
                    ) : scheduler.isError ? (
                        <ErrorState error={scheduler.error.error} />
                    ) : (
                        <Text>
                            Are you sure you want to delete{' '}
                            <Text fw={700} span>
                                "{scheduler.data?.name}"
                            </Text>
                            ?
                        </Text>
                    )}
                </Box>
                <Group justify="flex-end" gap="sm">
                    <Button onClick={onClose} variant="default">
                        Cancel
                    </Button>
                    {scheduler.isSuccess && (
                        <Button
                            loading={mutation.isLoading}
                            onClick={handleConfirm}
                            color="red"
                        >
                            Delete
                        </Button>
                    )}
                </Group>
            </Stack>
        </Modal>
    );
};
