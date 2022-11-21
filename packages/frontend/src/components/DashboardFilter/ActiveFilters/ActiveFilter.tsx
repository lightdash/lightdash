import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardFilterRule, FilterableField } from '@lightdash/common';
import { FC, useState } from 'react';
import { useDashboardTilesWithFilters } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { getFilterRuleLabel } from '../../common/Filters/configs';
import FilterConfiguration, { FilterTabs } from '../FilterConfiguration';
import { FilterModalContainer } from '../FilterSearch/FilterSearch.styles';
import {
    FilterValues,
    InvalidFilterTag,
    TagContainer,
} from './ActiveFilters.styles';

type Props = {
    fieldId: string;
    field: FilterableField | undefined;
    filterRule: DashboardFilterRule;
    onClick?: () => void;
    onRemove: () => void;
    onUpdate: (value: DashboardFilterRule) => void;
};

const ActiveFilter: FC<Props> = ({
    fieldId,
    field,
    filterRule,
    onClick,
    onRemove,
    onUpdate,
}) => {
    const { dashboardTiles } = useDashboardContext();
    const { data: tilesWithFilters, isLoading } =
        useDashboardTilesWithFilters(dashboardTiles);

    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>();

    if (isLoading || !tilesWithFilters) {
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
    return (
        <Popover2
            content={
                <FilterModalContainer $wide={selectedTabId === 'tiles'}>
                    <FilterConfiguration
                        selectedTabId={selectedTabId}
                        onTabChange={setSelectedTabId}
                        field={field}
                        tilesWithFilters={tilesWithFilters}
                        filterRule={filterRule}
                        onSave={onUpdate}
                    />
                </FilterModalContainer>
            }
            position="bottom"
        >
            <TagContainer interactive onRemove={onRemove} onClick={onClick}>
                <Tooltip2
                    content={`Table: ${field.tableLabel}`}
                    interactionKind="hover"
                    placement={'bottom-start'}
                >
                    <>
                        {`${filterRuleLabels.field}: ${filterRuleLabels.operator} `}
                        <FilterValues>{filterRuleLabels.value}</FilterValues>
                    </>
                </Tooltip2>
            </TagContainer>
        </Popover2>
    );
};

export default ActiveFilter;
