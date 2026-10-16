import { Button } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ErrorState from '../../../components/common/ErrorState';
import MantineModal from '../../../components/common/MantineModal';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useScheduler } from '../../../features/scheduler/hooks/useScheduler';
import { useSchedulersDeleteMutation } from '../../../features/scheduler/hooks/useSchedulersDeleteMutation';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';

export const SyncModalDelete = () => {
    const { t } = useTranslation('sync');
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
        return <SuboptimalState title={t('modal.loadingSync')} loading />;
    }

    if (scheduler.error) {
        return <ErrorState error={scheduler.error.error} />;
    }

    return (
        <MantineModal
            opened
            onClose={() => setAction(SyncModalAction.VIEW)}
            role="alertdialog"
            title={t('actions.delete', { ns: 'common' })}
            icon={IconTrash}
            size="lg"
            actions={
                <Button color="red" loading={isLoading} onClick={handleConfirm}>
                    {t('actions.delete', { ns: 'common' })}
                </Button>
            }
            description={t('modal.deleteConfirm', {
                name: scheduler.data?.name,
            })}
        />
    );
};
