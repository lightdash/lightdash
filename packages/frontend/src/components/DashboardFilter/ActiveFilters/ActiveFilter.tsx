import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardFilterRule, FilterableField } from '@lightdash/common';
import { FC, useState } from 'react';
import {
    useAvailableDashboardFilterTargets,
    useDashboardAvailableTileFilters,
} from '../../../hooks/dashboard/useDashboard';
import { useExplores } from '../../../hooks/useExplores';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import {
    getFilterRuleLabel,
    getFilterRuleTables,
} from '../../common/Filters/configs';
import { useTableContext } from '../../common/Table/TableProvider';
import FilterConfiguration, { FilterTabs } from '../FilterConfiguration';
import { FilterModalContainer } from '../FilterSearch/FilterSearch.styles';
import {
    FilterValues,
    InvalidFilterTag,
    TagContainer,
} from './ActiveFilters.styles';

type Props = {
    isEditMode: boolean;
    fieldId: string;
    field: FilterableField | undefined;
    filterRule: DashboardFilterRule;
    onClick?: () => void;
    onRemove: () => void;
    onUpdate: (value: DashboardFilterRule) => void;
};

const ActiveFilter: FC<Props> = ({
    isEditMode,
    fieldId,
    field,
    filterRule,
    onClick,
    onRemove,
    onUpdate,
}) => {
    const { dashboardTiles } = useDashboardContext();
    const { data: availableTileFilters, isLoading: isLoadingTileFilters } =
        useDashboardAvailableTileFilters(dashboardTiles);
    const {
        data: availableDashboardFilterTargets,
        isLoading: isLoadingDashboardFilterTargets,
    } = useAvailableDashboardFilterTargets(dashboardTiles);

    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>();

    if (
        isLoadingTileFilters ||
        isLoadingDashboardFilterTargets ||
        !availableTileFilters ||
        !availableDashboardFilterTargets
    ) {
        return null;
    }

    if (!field) {
        return (
            <InvalidFilterTag onRemove={onRemove}>
                Tried to reference field with unknown id: {fieldId}
            </InvalidFilterTag>
        );
    }
    const filterRuleLabels = getFilterRuleLabel(filterRule, field);
    const filterRuleTables = getFilterRuleTables(
        filterRule,
        field,
        availableDashboardFilterTargets,
    );

    return (
        <Popover2
            placement="bottom-start"
            content={
                <FilterModalContainer $wide={selectedTabId === 'tiles'}>
                    <FilterConfiguration
                        isEditMode={isEditMode}
                        tiles={dashboardTiles}
                        selectedTabId={selectedTabId}
                        onTabChange={setSelectedTabId}
                        field={field}
                        availableTileFilters={availableTileFilters}
                        filterRule={filterRule}
                        onSave={onUpdate}
                    />
                </FilterModalContainer>
            }
        >
            <TagContainer interactive onRemove={onRemove} onClick={onClick}>
                <Tooltip2
                    interactionKind="hover"
                    placement="bottom-start"
                    content={
                        filterRuleTables.length === 0
                            ? `Table: ${filterRuleTables[0]}`
                            : `Tables: ${filterRuleTables.join(', ')}`
                    }
                >
                    <>
                        {filterRule.label || filterRuleLabels.field}:{' '}
                        {filterRuleLabels.operator}{' '}
                        <FilterValues>{filterRuleLabels.value}</FilterValues>
                    </>
                </Tooltip2>
            </TagContainer>
        </Popover2>
    );
};

export default ActiveFilter;
