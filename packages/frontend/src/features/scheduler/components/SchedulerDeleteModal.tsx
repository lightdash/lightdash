import { getDefaultZIndex, Loader, Stack, Text } from '@mantine-8/core';
import { useCallback, useEffect, type FC } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import { useScheduler } from '../hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../hooks/useSchedulersDeleteMutation';

interface SchedulerDeleteModalProps
    extends Pick<MantineModalProps, 'opened' | 'onClose'> {
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            modalRootProps={{ zIndex: getDefaultZIndex('popover') }}
            title="Delete scheduled delivery"
            variant="delete"
            resourceType="scheduled delivery"
            resourceLabel={scheduler.data?.name}
            size="md"
            onConfirm={scheduler.isSuccess ? handleConfirm : undefined}
            confirmLoading={mutation.isLoading}
        >
            {scheduler.isInitialLoading ? (
                <Stack h={200} w="100%" align="center" justify="center">
                    <Text fw={600}>Loading scheduler</Text>
                    <Loader />
                </Stack>
            ) : scheduler.isError ? (
                <ErrorState error={scheduler.error.error} />
            ) : null}
        </MantineModal>
    );
};
