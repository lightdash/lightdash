import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardTileTypes } from '@lightdash/common';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAvailableDashboardFilterTargets } from '../../hooks/dashboard/useDashboard';
import { useProject } from '../../hooks/useProject';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { FiltersProvider } from '../common/Filters/FiltersProvider';
import ActiveFilters from './ActiveFilters';
import {
    DashboardFilterWrapper,
    FilterTrigger,
} from './DashboardFilter.styles';
import FilterSearch from './FilterSearch';

interface Props {
    isEditMode: boolean;
}

const DashboardFilter: FC<Props> = ({ isEditMode }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

    const project = useProject(projectUuid);
    const { dashboardFilters, fieldsWithSuggestions, dashboardTiles } =
        useDashboardContext();

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
            startOfWeek={project.data?.warehouseConnection?.startOfWeek}
        >
            <DashboardFilterWrapper>
                <Popover2
                    disabled={!hasChartTiles || isLoading}
                    canEscapeKeyClose={isSubmenuOpen ? false : true}
                    interactionKind={isSubmenuOpen ? 'click-target' : 'click'}
                    placement="bottom-start"
                    onOpened={() => setIsOpen(true)}
                    onClose={handleClose}
                    content={
                        <FilterSearch
                            isEditMode={isEditMode}
                            fields={filterableFields || []}
                            popoverProps={{
                                onOpened: () => setIsSubmenuOpen(true),
                                onOpening: () => setIsSubmenuOpen(true),
                                onClose: () => setIsSubmenuOpen(false),
                                onClosing: () => setIsSubmenuOpen(false),
                            }}
                            onClose={handleClose}
                            onSelectField={handleClose}
                        />
                    }
                >
                    <Tooltip2
                        disabled={isOpen || isEditMode}
                        placement="bottom-start"
                        interactionKind="hover"
                        content={
                            <>
                                Only filters added in <b>'edit'</b> mode will be
                                saved
                            </>
                        }
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
                </Popover2>

                {!isLoading && dashboardFilters && (
                    <ActiveFilters isEditMode={isEditMode} />
                )}
            </DashboardFilterWrapper>
        </FiltersProvider>
    );
};

export default DashboardFilter;
