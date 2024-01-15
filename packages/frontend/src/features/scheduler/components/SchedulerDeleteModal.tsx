import {
    Box,
    Button,
    Group,
    Loader,
    Modal,
    ModalProps,
    Stack,
    Text,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import React, { FC, useCallback, useEffect } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useScheduler } from '../hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../hooks/useSchedulersDeleteMutation';

interface DashboardDeleteModalProps extends ModalProps {
    schedulerUuid: string;
    onConfirm: () => void;
}

export const SchedulerDeleteModal: FC<DashboardDeleteModalProps> = ({
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
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} size="lg" color="red" />
                    <Text fw={600}>Delete scheduled delivery</Text>
                </Group>
            }
            onClose={onClose}
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Box px="md" py="xl">
                {scheduler.isInitialLoading ? (
                    <Stack h={300} w="100%" align="center">
                        <Text fw={600}>Loading schedulers</Text>
                        <Loader />
                    </Stack>
                ) : scheduler.isError ? (
                    <ErrorState error={scheduler.error.error} />
                ) : (
                    <Text span>
                        Are you sure you want to delete{' '}
                        <Text fw={700} span>
                            "{scheduler.data?.name}"
                        </Text>
                        ?
                    </Text>
                )}
            </Box>
            <Group
                position="right"
                p="md"
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[4]}`,
                })}
            >
                <Button onClick={onClose} color="dark" variant="outline">
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
        </Modal>
    );
};
