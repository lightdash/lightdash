import { Text } from '@mantine-8/core';
import { useEffect, type FormEvent } from 'react';
import ErrorState from '../../../components/common/ErrorState';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useScheduler } from '../../../features/scheduler/hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../../../features/scheduler/hooks/useSchedulersDeleteMutation';
import { SYNC_FORM_ID, SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';

export const SyncModalDelete = () => {
    const { currentSchedulerUuid, setAction, setIsDeleting } = useSyncModal();
    const scheduler = useScheduler(currentSchedulerUuid ?? '');
    const {
        mutate: deleteScheduler,
        isLoading,
        isSuccess: isSchedulerDeleteSuccessful,
    } = useSchedulersDeleteMutation();

    // Sync loading state to context for external footer rendering
    useEffect(() => {
        setIsDeleting(isLoading);
    }, [isLoading, setIsDeleting]);

    useEffect(() => {
        if (isSchedulerDeleteSuccessful) {
            setAction(SyncModalAction.VIEW);
        }
    }, [isSchedulerDeleteSuccessful, setAction]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!currentSchedulerUuid) return;
        deleteScheduler(currentSchedulerUuid);
    };

    if (scheduler.isInitialLoading) {
        return <SuboptimalState title="Loading sync" loading />;
    }

    if (scheduler.error) {
        return <ErrorState error={scheduler.error.error} />;
    }

    return (
        <form id={SYNC_FORM_ID} onSubmit={handleSubmit}>
            <Text>
                Are you sure you want to delete <b>"{scheduler.data?.name}"</b>?
            </Text>
        </form>
    );
};
