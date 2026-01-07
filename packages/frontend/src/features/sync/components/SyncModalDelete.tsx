import { Button } from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import MantineModal from '../../../components/common/MantineModal';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useScheduler } from '../../../features/scheduler/hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../../../features/scheduler/hooks/useSchedulersDeleteMutation';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';

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
        <MantineModal
            opened
            onClose={() => setAction(SyncModalAction.VIEW)}
            title="Delete"
            icon={IconTrash}
            size="lg"
            actions={
                <Button color="red" loading={isLoading} onClick={handleConfirm}>
                    Delete
                </Button>
            }
            description={`Are you sure you want to delete "${scheduler.data?.name}"?`}
        />
    );
};
