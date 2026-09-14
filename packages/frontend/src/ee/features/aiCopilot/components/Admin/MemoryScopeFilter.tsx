import type { AiAgentMemoryScope } from '@lightdash/common';
import { IconTag } from '@tabler/icons-react';
import { type FC } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { type useAiAgentAdminMemoryFilters } from '../../hooks/useAiAgentAdminMemoryFilters';
import { MEMORY_SCOPE_LABELS } from './memoryScope';

const OPTIONS: FilterFacetOption[] = (
    Object.keys(MEMORY_SCOPE_LABELS) as AiAgentMemoryScope[]
).map((scope) => ({ value: scope, label: MEMORY_SCOPE_LABELS[scope] }));

type MemoryScopeFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminMemoryFilters>,
    'selectedScopes' | 'setSelectedScopes'
>;

const MemoryScopeFilter: FC<MemoryScopeFilterProps> = ({
    selectedScopes,
    setSelectedScopes,
}) => (
    <FilterFacet
        label="Scope"
        icon={IconTag}
        options={OPTIONS}
        selected={selectedScopes}
        onChange={setSelectedScopes}
        tooltipLabel="Filter memories by scope"
        emptyLabel="No scopes available."
    />
);

export default MemoryScopeFilter;
