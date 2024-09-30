import { Button, Group, Stack, Text } from '@mantine/core';
import { useCallback, useEffect } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useScheduler } from '../../../features/scheduler/hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../../../features/scheduler/hooks/useSchedulersDeleteMutation';
import { SyncModalAction, useSyncModal } from '../providers/SyncModalProvider';

export const SyncModalDelete = () => {
    const { currentSchedulerUuid, setAction } = useSyncModal();
    const scheduler = useScheduler(currentSchedulerUuid ?? '');
    const {
        mutate: deleteScheduler,
        isLoading,
        isSuccess: isSchedulerDeleteSuccessful,
    } = useSchedulersDeleteMutation();

    useEffect(() => {
        if (isSchedulerDeleteSuccessful) {
            setAction(SyncModalAction.VIEW);
        }
    }, [isSchedulerDeleteSuccessful, setAction]);

    const handleConfirm = useCallback(() => {
        if (!currentSchedulerUuid) return;
        deleteScheduler(currentSchedulerUuid);
    }, [deleteScheduler, currentSchedulerUuid]);

    if (scheduler.isInitialLoading) {
        return <SuboptimalState title="Loading sync" loading />;
    }

    if (scheduler.error) {
        return <ErrorState error={scheduler.error.error} />;
    }

    return (
        <Stack spacing="lg">
            <Text>
                Are you sure you want to delete <b>"{scheduler.data?.name}"</b>?
            </Text>

            <Group position="apart">
                <Button
                    variant="outline"
                    color="dark"
                    onClick={() => setAction(SyncModalAction.VIEW)}
                >
                    Cancel
                </Button>

                {scheduler.isSuccess && (
                    <Button
                        color="red"
                        loading={isLoading}
                        onClick={handleConfirm}
                    >
                        Delete
                    </Button>
                )}
            </Group>
        </Stack>
    );
};
