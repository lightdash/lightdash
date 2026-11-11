import { Box } from '@mantine/core';
import { type ComponentProps, type FC, type ReactNode } from 'react';
import { useCompactContentHeader } from '../../components/common/Page/useCompactContentHeader';
import {
    selectControlSections,
    selectHasStoredControlOrder,
    useDashboardSelector,
} from '../dashboard/store';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import { useIsAddFilterButtonShown } from '../dashboardFilters/useIsAddFilterButtonShown';
import { DateZoomCrossTabFieldsLoader } from '../dateZoom/components/DateZoomCrossTabFieldsLoader';
import { AddControl } from './AddControl';
import classes from './ControlsBar.module.css';
import { ControlsLead } from './ControlsStrip';
import { DateZoomMappingRow } from './DateZoomMappingRow';
import { DateZoomPills } from './DateZoomPills';
import { FilterPills } from './FilterPills';
import { MappingRow } from './MappingRow';
import { ParameterMappingRow } from './ParameterMappingRow';
import { ParameterPills } from './ParameterPills';
import { SectionedFilters } from './SectionedFilters';
import { SettledFilterFields } from './SettledFilterFields';
import { getControlTotal, useControlCounts } from './useControlCounts';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useHasControlsToggle } from './useHasControlsToggle';
import { useParameterEditorSelector } from './useParameterEditor';

const NO_PARAMETERS = {};

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBar>,
    'filterArea' | 'isCompactDrawerSuppressed'
>;

// The shipped bar with its filter area swapped, in edit and view mode alike
export const ControlsBar: FC<Props> = (props) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const compact = useCompactContentHeader();
    const hasToggle = useHasControlsToggle(props.isEditMode);
    const counts = useControlCounts();
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    // "Add" shows for an editor, and for a viewer who can add where tiles take filters
    const isAddShown = useIsAddFilterButtonShown(props.isEditMode);
    const hasAdd =
        props.isEditMode ||
        (canAddFilters && props.hasTilesThatSupportFilters && isAddShown);
    // Sections or a stored order need the sectioned bar; else a viewer's is flat
    const hasSections = useDashboardSelector(
        (state) =>
            selectControlSections(state).length > 0 ||
            selectHasStoredControlOrder(state),
    );
    const lead = (
        <ControlsLead
            counts={counts}
            isOpen
            onToggle={props.onCollapse}
            // As the shipped Hide: not behind the narrow drawer
            withToggle={hasToggle && !compact}
            hasFollowing={getControlTotal(counts) > 0 || hasAdd}
        />
    );
    const filterRow = (
        <DashboardFiltersBar
            {...props}
            // Date zoom shows on any dashboard with tiles, as the shipped right side
            hasTilesThatSupportFilters={
                props.hasTilesThatSupportFilters || props.hasDashboardTiles
            }
            // Parameters are controls on this bar, after the filters; none until they are built
            parameters={NO_PARAMETERS}
            // The rail is on the page: a drawer over it would hide it
            isCompactDrawerSuppressed={isSidebarOpen}
            // The flat bar's items share each line's centre with the
            // 30px funnel; the sectioned flow centres its own lines
            filtersAlign={
                hasSections || props.isEditMode ? 'flex-start' : 'center'
            }
            // The sectioned flow spans several lines: parameters wrap beside it
            isParametersColumn={hasSections || props.isEditMode}
            // Every pill carries its kind's icon; date zooms are pills too
            withGroupMarkers={false}
            withDateZoom={false}
            // The strip's toggle collapses it instead
            withHideButton={false}
            filterArea={
                <SettledFilterFields>
                    {/* An editor's bar is always sectioned: its selection starts the first section */}
                    {!props.hasTilesThatSupportFilters ? (
                        // No tile takes filters or parameters: only date zoom
                        <>
                            {lead}
                            {props.isEditMode && <AddControl />}
                            <DateZoomPills />
                        </>
                    ) : hasSections || props.isEditMode ? (
                        // In the flow, so its lines wrap back under the lead
                        <SectionedFilters
                            activeTabUuid={props.activeTabUuid}
                            leading={lead}
                        />
                    ) : (
                        <>
                            {lead}
                            <AddControl />
                            <FilterPills activeTabUuid={props.activeTabUuid} />
                            <ParameterPills />
                            <DateZoomPills />
                        </>
                    )}
                </SettledFilterFields>
            }
        />
    );
    return (
        <>
            <MappingSwap>{filterRow}</MappingSwap>
            {/* As the shipped date zoom: fields of tiles on other tabs, for editors */}
            {props.isEditMode && props.hasDashboardTiles && (
                <DateZoomCrossTabFieldsLoader />
            )}
        </>
    );
};

// While tiles are chosen the mapping row cross-fades into the filter row's
// place. The filter row stays mounted, faded, inert and out of the layout,
// so the bar shrinks to one line and the row comes back at once
export const MappingSwap: FC<{ children: ReactNode }> = ({ children }) => {
    const isFilterMapping = useControlsSidebarSelector((c) => c.isMapping);
    const isParameterMapping = useParameterEditorSelector((c) => c.isMapping);
    const isDateZoomMapping = useDateZoomEditorSelector((c) => c.isMapping);
    const isMapping =
        isFilterMapping || isParameterMapping || isDateZoomMapping;
    return (
        <Box className={classes.swap}>
            <Box
                className={classes.filterRow}
                data-hidden={isMapping || undefined}
                inert={isMapping || undefined}
            >
                {children}
            </Box>
            {isFilterMapping && <MappingRow />}
            {isParameterMapping && <ParameterMappingRow />}
            {isDateZoomMapping && <DateZoomMappingRow />}
        </Box>
    );
};
