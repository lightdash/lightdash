import { SchedulerRunStatus } from '@lightdash/common';
import { type FC } from 'react';
import { type useLogsFilters } from '../../../features/scheduler/hooks/useLogsFilters';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';

type StatusFilterProps = Pick<
    ReturnType<typeof useLogsFilters>,
    'selectedStatuses' | 'setSelectedStatuses'
>;

const STATUS_LABELS: Record<SchedulerRunStatus, string> = {
    [SchedulerRunStatus.COMPLETED]: 'Completed',
    [SchedulerRunStatus.PARTIAL_FAILURE]: 'Partial Failure',
    [SchedulerRunStatus.FAILED]: 'Failed',
    [SchedulerRunStatus.RUNNING]: 'Running',
    [SchedulerRunStatus.SCHEDULED]: 'Scheduled',
};

const STATUS_OPTIONS: FilterFacetOption[] = Object.values(SchedulerRunStatus)
    .filter((status) => status !== SchedulerRunStatus.SCHEDULED)
    .map((status) => ({
        value: status,
        label: STATUS_LABELS[status],
    }));

const StatusFilter: FC<StatusFilterProps> = ({
    selectedStatuses,
    setSelectedStatuses,
}) => (
    <FilterFacet
        label="Status"
        options={STATUS_OPTIONS}
        selected={selectedStatuses}
        onChange={(values) =>
            setSelectedStatuses(values as SchedulerRunStatus[])
        }
        tooltipLabel="Filter runs by status"
    />
);

export default StatusFilter;
