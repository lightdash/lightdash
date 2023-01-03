import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardFilterRule, FilterableField } from '@lightdash/common';
import { FC, useState } from 'react';
import { useDashboardAvailableTileFilters } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import {
    getFilterRuleLabel,
    getFilterRuleTables,
} from '../../common/Filters/configs';
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
    const { data: availableTileFilters, isLoading } =
        useDashboardAvailableTileFilters(dashboardTiles);

    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>();

    if (isLoading || !availableTileFilters) {
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
    const filterRuleTables = getFilterRuleTables(filterRule, field);

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
