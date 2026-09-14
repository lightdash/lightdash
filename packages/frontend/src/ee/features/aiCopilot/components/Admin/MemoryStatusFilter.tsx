import type { AiAgentMemoryStatus } from '@lightdash/common';
import { IconCircleDotted } from '@tabler/icons-react';
import { type FC } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { type useAiAgentAdminMemoryFilters } from '../../hooks/useAiAgentAdminMemoryFilters';
import { MEMORY_STATUS_LABELS } from './memoryStatus';

const OPTIONS: FilterFacetOption[] = (
    Object.keys(MEMORY_STATUS_LABELS) as AiAgentMemoryStatus[]
).map((status) => ({ value: status, label: MEMORY_STATUS_LABELS[status] }));

type MemoryStatusFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminMemoryFilters>,
    'selectedStatuses' | 'setSelectedStatuses'
>;

const MemoryStatusFilter: FC<MemoryStatusFilterProps> = ({
    selectedStatuses,
    setSelectedStatuses,
}) => (
    <FilterFacet
        label="Status"
        icon={IconCircleDotted}
        options={OPTIONS}
        selected={selectedStatuses}
        onChange={setSelectedStatuses}
        tooltipLabel="Filter memories by status"
        emptyLabel="No statuses available."
    />
);

export default MemoryStatusFilter;
