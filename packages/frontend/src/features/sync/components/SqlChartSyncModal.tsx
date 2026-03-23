import { SchedulerFormat } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { type MantineModalProps } from '../../../components/common/MantineModal';
import { useSqlChartSchedulers } from '../hooks/useSqlChartSchedulers';
import { SyncModalProvider } from '../providers/SyncModalProvider';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { SyncModalCreateOrEdit } from './SyncModalCreateOrEdit';
import { SyncModalDelete } from './SyncModalDelete';
import { SyncModalView } from './SyncModalView';

type Props = {
    projectUuid: string;
    savedSqlUuid: string;
} & Pick<MantineModalProps, 'opened' | 'onClose'>;

const SqlChartSyncModalContent: FC<Props> = ({
    projectUuid,
    savedSqlUuid,
    opened,
    onClose,
}) => {
    const { action } = useSyncModal();
    const { data: schedulers } = useSqlChartSchedulers(
        projectUuid,
        savedSqlUuid,
    );

    const gsheetsSchedulers = useMemo(
        () =>
            schedulers?.filter((s) => s.format === SchedulerFormat.GSHEETS) ??
            [],
        [schedulers],
    );

    if (action === SyncModalAction.VIEW || action === SyncModalAction.DELETE) {
        return (
            <>
                <SyncModalView
                    schedulers={gsheetsSchedulers}
                    onClose={onClose}
                />
                {action === SyncModalAction.DELETE && <SyncModalDelete />}
            </>
        );
    }

    if (action === SyncModalAction.CREATE || action === SyncModalAction.EDIT) {
        return (
            <SyncModalCreateOrEdit
                chartUuid={savedSqlUuid}
                opened={opened}
                onClose={onClose}
                projectUuid={projectUuid}
            />
        );
    }

    return null;
};

export const SqlChartSyncModal: FC<Props> = (props) => (
    <SyncModalProvider>
        <SqlChartSyncModalContent {...props} />
    </SyncModalProvider>
);
