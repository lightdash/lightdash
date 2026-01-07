import { useEffect, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { type MantineModalProps } from '../../../components/common/MantineModal';
import { getSchedulerUuidFromUrlParams } from '../../../features/scheduler/utils';
import { SyncModalProvider } from '../providers/SyncModalProvider';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { SyncModalCreateOrEdit } from './SyncModalCreateOrEdit';
import { SyncModalDelete } from './SyncModalDelete';
import { SyncModalView } from './SyncModalView';

type Props = { chartUuid: string } & Pick<
    MantineModalProps,
    'opened' | 'onClose'
>;

const SyncModalBaseAndManager: FC<Props> = ({ chartUuid, opened, onClose }) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const { action, setAction, setCurrentSchedulerUuid } = useSyncModal();

    useEffect(() => {
        const schedulerUuidFromParams = getSchedulerUuidFromUrlParams(search);

        if (schedulerUuidFromParams) {
            setAction(SyncModalAction.EDIT);
            setCurrentSchedulerUuid(schedulerUuidFromParams);
            void navigate({ pathname }, { replace: true });
        }
    }, [navigate, pathname, search, setAction, setCurrentSchedulerUuid]);

    if (action === SyncModalAction.VIEW || action === SyncModalAction.DELETE) {
        return (
            <>
                <SyncModalView chartUuid={chartUuid} onClose={onClose} />
                {action === SyncModalAction.DELETE && <SyncModalDelete />}
            </>
        );
    }

    if (action === SyncModalAction.CREATE || action === SyncModalAction.EDIT) {
        return (
            <SyncModalCreateOrEdit
                chartUuid={chartUuid}
                opened={opened}
                onClose={onClose}
            />
        );
    }
};

export const SyncModal: FC<Props> = ({ chartUuid, opened, onClose }) => (
    <SyncModalProvider>
        <SyncModalBaseAndManager
            chartUuid={chartUuid}
            opened={opened}
            onClose={onClose}
        />
    </SyncModalProvider>
);
