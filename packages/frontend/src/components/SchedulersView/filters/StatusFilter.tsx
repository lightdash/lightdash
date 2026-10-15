import { SchedulerRunStatus } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type useLogsFilters } from '../../../features/scheduler/hooks/useLogsFilters';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';

type StatusFilterProps = Pick<
    ReturnType<typeof useLogsFilters>,
    'selectedStatuses' | 'setSelectedStatuses'
>;

const STATUS_LABEL_KEYS: Record<SchedulerRunStatus, string> = {
    [SchedulerRunStatus.COMPLETED]: 'filters.status.completed',
    [SchedulerRunStatus.PARTIAL_FAILURE]: 'filters.status.partialFailure',
    [SchedulerRunStatus.FAILED]: 'filters.status.failed',
    [SchedulerRunStatus.RUNNING]: 'filters.status.running',
    [SchedulerRunStatus.SCHEDULED]: 'filters.status.scheduled',
};

const StatusFilter: FC<StatusFilterProps> = ({
    selectedStatuses,
    setSelectedStatuses,
}) => {
    const { t } = useTranslation('scheduler');
    const options = useMemo<FilterFacetOption[]>(
        () =>
            Object.values(SchedulerRunStatus)
                .filter((status) => status !== SchedulerRunStatus.SCHEDULED)
                .map((status) => ({
                    value: status,
                    label: t(STATUS_LABEL_KEYS[status]),
                })),
        [t],
    );
    return (
        <FilterFacet
            label={t('filters.status.label')}
            options={options}
            selected={selectedStatuses}
            onChange={(values) =>
                setSelectedStatuses(values as SchedulerRunStatus[])
            }
            tooltipLabel={t('filters.status.tooltip')}
        />
    );
};

export default StatusFilter;
