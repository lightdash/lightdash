import { Classes, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardTileTypes } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { useAvailableDashboardFilterTargets } from '../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import ActiveFilters from './ActiveFilters';
import {
    DashboardFilterWrapper,
    FilterTrigger,
    Tooltip,
    TriggerWrapper,
} from './DashboardFilter.styles';
import FilterSearch from './FilterSearch';

interface Props {
    isEditMode: boolean;
}

const DashboardFilter: FC<Props> = ({ isEditMode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const {
        dashboard,
        fieldsWithSuggestions,
        dashboardFilters,
        dashboardTiles,
    } = useDashboardContext();
    const { isLoading, data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboard, dashboardTiles);
    const hasChartTiles =
        dashboardTiles.filter(
            (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
        ).length >= 1;
    return (
        <FiltersProvider fieldsMap={fieldsWithSuggestions}>
            <DashboardFilterWrapper>
                <TriggerWrapper
                    content={
                        <FilterSearch
                            isEditMode={isEditMode}
                            fields={filterableFields}
                            onClose={() => setIsOpen(false)}
                        />
                    }
                    interactionKind="click"
                    popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                    isOpen={isOpen}
                    onInteraction={setIsOpen}
                    position="bottom-right"
                    lazy={false}
                    disabled={!hasChartTiles || isLoading}
                >
                    <Tooltip2
                        content={
                            <Tooltip>
                                Only filters added in <b>'edit'</b> mode will be
                                saved
                            </Tooltip>
                        }
                        placement="bottom"
                        interactionKind="hover"
                        disabled={isOpen || isEditMode}
                    >
                        <FilterTrigger
                            minimal
                            icon="filter-list"
                            loading={isLoading}
                            disabled={!hasChartTiles || isLoading}
                        >
                            Add filter
                        </FilterTrigger>
                    </Tooltip2>
                </TriggerWrapper>
                {!isLoading && dashboardFilters && <ActiveFilters />}
            </DashboardFilterWrapper>
        </FiltersProvider>
    );
};

export default DashboardFilter;
