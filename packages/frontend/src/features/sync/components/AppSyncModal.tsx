import { SchedulerFormat } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { type MantineModalProps } from '../../../components/common/MantineModal';
import { useAppSchedulers } from '../../../features/scheduler/hooks/useAppSchedulers';
import { SyncModalProvider } from '../providers/SyncModalProvider';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { SyncModalCreateOrEdit } from './SyncModalCreateOrEdit';
import { SyncModalDelete } from './SyncModalDelete';
import { SyncModalView } from './SyncModalView';

type Props = {
    projectUuid: string;
    appUuid: string;
} & Pick<MantineModalProps, 'opened' | 'onClose'>;

const AppSyncModalContent: FC<Props> = ({
    projectUuid,
    appUuid,
    opened,
    onClose,
}) => {
    const { action } = useSyncModal();
    // The app schedulers endpoint returns every format unfiltered (small,
    // unpaginated list) — filter to gsheets here the same way
    // SqlChartSyncModal filters its own unfiltered schedulers list.
    const { data } = useAppSchedulers({ projectUuid, appUuid });

    const gsheetsSchedulers = useMemo(
        () =>
            (data?.pages.flatMap((page) => page.data) ?? []).filter(
                (s) => s.format === SchedulerFormat.GSHEETS,
            ),
        [data],
    );

    if (action === SyncModalAction.VIEW || action === SyncModalAction.DELETE) {
        return (
            <>
                <SyncModalView
                    schedulers={gsheetsSchedulers}
                    resourceLabel="app"
                    onClose={onClose}
                />
                {action === SyncModalAction.DELETE && <SyncModalDelete />}
            </>
        );
    }

    if (action === SyncModalAction.CREATE || action === SyncModalAction.EDIT) {
        return (
            <SyncModalCreateOrEdit
                resource={{ type: 'app', projectUuid, appUuid }}
                opened={opened}
                onClose={onClose}
            />
        );
    }

    return null;
};

export const AppSyncModal: FC<Props> = (props) => (
    <SyncModalProvider>
        <AppSyncModalContent {...props} />
    </SyncModalProvider>
);
