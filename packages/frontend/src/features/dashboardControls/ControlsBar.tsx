import { Box } from '@mantine/core';
import { type ComponentProps, type FC, type ReactNode } from 'react';
import {
    selectControlSections,
    selectParameterControls,
    useDashboardSelector,
} from '../dashboard/store';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import { DateZoom } from '../dateZoom';
import { AddControl } from './AddControl';
import classes from './ControlsBar.module.css';
import { DateZoomEditorPills } from './DateZoomEditorPills';
import { FilterPills } from './FilterPills';
import { MappingRow } from './MappingRow';
import { ParameterMappingRow } from './ParameterMappingRow';
import { ParameterPills } from './ParameterPills';
import { SectionedFilters } from './SectionedFilters';
import { SettledFilterFields } from './SettledFilterFields';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useParameterEditorSelector } from './useParameterEditor';

const NO_PARAMETERS = {};

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBar>,
    'filterArea' | 'isCompactDrawerSuppressed'
>;

// The shipped bar with its filter area swapped, in edit and view mode alike
export const ControlsBar: FC<Props> = (props) => {
    const controls = useDashboardSelector(selectParameterControls);
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const hasSections = useDashboardSelector(
        (state) => selectControlSections(state).length > 0,
    );
    const filterRow = (
        <DashboardFiltersBar
            {...props}
            // Parameters are controls on this bar, after the filters
            parameters={controls === null ? props.parameters : NO_PARAMETERS}
            // The rail is on the page: a drawer over it would hide it
            isCompactDrawerSuppressed={isSidebarOpen}
            // The flat bar's items share each line's centre with the
            // 30px funnel; the sectioned flow centres its own lines
            filtersAlign={
                hasSections || props.isEditMode ? 'flex-start' : 'center'
            }
            // The sectioned flow spans several lines: parameters wrap beside it
            isParametersColumn={hasSections || props.isEditMode}
            // An editor's named zooms open in the controls editor
            dateZoom={
                <DateZoom
                    isEditMode={props.isEditMode}
                    controlPills={
                        props.isEditMode ? <DateZoomEditorPills /> : undefined
                    }
                />
            }
            filterArea={
                <SettledFilterFields>
                    {/* An editor's bar is always sectioned: its selection starts the first section */}
                    {hasSections || props.isEditMode ? (
                        <SectionedFilters activeTabUuid={props.activeTabUuid} />
                    ) : (
                        <>
                            <AddControl />
                            <FilterPills activeTabUuid={props.activeTabUuid} />
                            <ParameterPills />
                        </>
                    )}
                </SettledFilterFields>
            }
        />
    );
    return <MappingSwap>{filterRow}</MappingSwap>;
};

// While tiles are chosen the mapping row cross-fades into the filter row's
// place. The filter row stays mounted, faded, inert and out of the layout,
// so the bar shrinks to one line and the row comes back at once
export const MappingSwap: FC<{ children: ReactNode }> = ({ children }) => {
    const isFilterMapping = useControlsSidebarSelector((c) => c.isMapping);
    const isParameterMapping = useParameterEditorSelector((c) => c.isMapping);
    const isMapping = isFilterMapping || isParameterMapping;
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
        </Box>
    );
};
