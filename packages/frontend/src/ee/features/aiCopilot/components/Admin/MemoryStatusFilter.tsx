import type { AiAgentMemoryStatus } from '@lightdash/common';
import { IconCircleDotted } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { type useAiAgentAdminMemoryFilters } from '../../hooks/useAiAgentAdminMemoryFilters';
import { MEMORY_STATUS_LABELS } from './memoryStatus';

type MemoryStatusFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminMemoryFilters>,
    'selectedStatuses' | 'setSelectedStatuses'
>;

const MemoryStatusFilter: FC<MemoryStatusFilterProps> = ({
    selectedStatuses,
    setSelectedStatuses,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const options: FilterFacetOption[] = (
        Object.keys(MEMORY_STATUS_LABELS) as AiAgentMemoryStatus[]
    ).map((status) => ({ value: status, label: MEMORY_STATUS_LABELS[status] }));
    return (
        <FilterFacet
            label={t('filters.status.label')}
            icon={IconCircleDotted}
            options={options}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
            tooltipLabel={t('filters.status.tooltip')}
            emptyLabel={t('filters.status.empty')}
        />
    );
};

export default MemoryStatusFilter;
