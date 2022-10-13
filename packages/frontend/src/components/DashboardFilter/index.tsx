import { Classes, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardTileTypes } from '@lightdash/common';
import React, { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

    const {
        dashboard,
        fieldsWithSuggestions,
        dashboardFilters,
        dashboardTiles,
    } = useDashboardContext();
    const { isLoading, data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboardTiles);

    const hasChartTiles =
        dashboardTiles.filter(
            (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
        ).length >= 1;

    const handleClose = () => {
        setIsSubmenuOpen(false);
        setIsOpen(false);
    };

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            fieldsMap={fieldsWithSuggestions}
        >
            <DashboardFilterWrapper>
                <TriggerWrapper
                    content={
                        <FilterSearch
                            isEditMode={isEditMode}
                            fields={filterableFields}
                            popoverProps={{
                                onOpened: () => setIsSubmenuOpen(true),
                                onClose: () => setIsSubmenuOpen(false),
                            }}
                            onClose={handleClose}
                            onSelectField={handleClose}
                        />
                    }
                    canEscapeKeyClose={isSubmenuOpen ? false : true}
                    interactionKind={isSubmenuOpen ? 'click-target' : 'click'}
                    popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                    onOpened={() => setIsOpen(true)}
                    onClose={handleClose}
                    position="bottom-right"
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
