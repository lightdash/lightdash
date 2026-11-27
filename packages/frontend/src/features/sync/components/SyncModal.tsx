import { SchedulerFormat } from '@lightdash/common';
import { useCallback, useMemo, type FC } from 'react';
import { type MantineModalProps } from '../../../components/common/MantineModal';
import { useChartSchedulers } from '../../../features/scheduler/hooks/useChartSchedulers';
import { SyncModalProvider } from '../providers/SyncModalProvider';
import { SyncModalAction } from '../providers/types';
import { useSyncModal } from '../providers/useSyncModal';
import { type SyncResource } from '../types';
import { SyncModalCreateOrEdit } from './SyncModalCreateOrEdit';
import { SyncModalDelete } from './SyncModalDelete';
import { SyncModalView } from './SyncModalView';

type Props = {
    chart: Extract<SyncResource, { type: 'chart' }>['chart'];
} & Pick<MantineModalProps, 'opened' | 'onClose'>;

const SyncModalBaseAndManager: FC<Props> = ({ chart, opened, onClose }) => {
    const { action } = useSyncModal();

    const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
        useChartSchedulers({
            chartUuid: chart.uuid,
            formats: [SchedulerFormat.GSHEETS],
        });

    const schedulers = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const handleScrollBottom = useCallback(() => {
        if (!isFetchingNextPage && hasNextPage) {
            void fetchNextPage();
        }
    }, [fetchNextPage, isFetchingNextPage, hasNextPage]);

    if (action === SyncModalAction.VIEW || action === SyncModalAction.DELETE) {
        return (
            <>
                <SyncModalView
                    schedulers={schedulers}
                    resourceLabel="chart"
                    isFetchingNextPage={isFetchingNextPage}
                    onScrollBottom={handleScrollBottom}
                    onClose={onClose}
                />
                {action === SyncModalAction.DELETE && <SyncModalDelete />}
            </>
        );
    }

    if (action === SyncModalAction.CREATE || action === SyncModalAction.EDIT) {
        return (
            <SyncModalCreateOrEdit
                resource={{ type: 'chart', chart }}
                opened={opened}
                onClose={onClose}
            />
        );
    }
};

export const SyncModal: FC<Props & { initialSchedulerUuid?: string }> = ({
    initialSchedulerUuid,
    ...props
}) => (
    <SyncModalProvider initialSchedulerUuid={initialSchedulerUuid}>
        <SyncModalBaseAndManager {...props} />
    </SyncModalProvider>
);
