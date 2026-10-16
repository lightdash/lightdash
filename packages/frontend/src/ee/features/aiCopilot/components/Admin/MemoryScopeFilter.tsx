import type { AiAgentMemoryScope } from '@lightdash/common';
import { IconTag } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { type useAiAgentAdminMemoryFilters } from '../../hooks/useAiAgentAdminMemoryFilters';
import { MEMORY_SCOPE_LABELS } from './memoryScope';

type MemoryScopeFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminMemoryFilters>,
    'selectedScopes' | 'setSelectedScopes'
>;

const MemoryScopeFilter: FC<MemoryScopeFilterProps> = ({
    selectedScopes,
    setSelectedScopes,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const options: FilterFacetOption[] = (
        Object.keys(MEMORY_SCOPE_LABELS) as AiAgentMemoryScope[]
    ).map((scope) => ({ value: scope, label: MEMORY_SCOPE_LABELS[scope] }));
    return (
        <FilterFacet
            label={t('filters.scope.label')}
            icon={IconTag}
            options={options}
            selected={selectedScopes}
            onChange={setSelectedScopes}
            tooltipLabel={t('filters.scope.tooltip')}
            emptyLabel={t('filters.scope.empty')}
        />
    );
};

export default MemoryScopeFilter;
