import { Box } from '@mantine/core';
import { type ComponentProps, type FC } from 'react';
import {
    selectControlSections,
    useDashboardSelector,
} from '../dashboard/store';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import { AddControl } from './AddControl';
import classes from './ControlsBar.module.css';
import { FilterPills } from './FilterPills';
import { MappingRow } from './MappingRow';
import { SectionedFilters } from './SectionedFilters';
import { SettledFilterFields } from './SettledFilterFields';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBar>,
    'filterArea' | 'isCompactDrawerSuppressed'
>;

// The shipped bar with its filter area swapped, in edit and view mode alike.
// While tiles are chosen the mapping row cross-fades into its place
export const ControlsBar: FC<Props> = (props) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const isMapping = useControlsSidebarSelector((c) => c.isMapping);
    const hasSections = useDashboardSelector(
        (state) => selectControlSections(state).length > 0,
    );
    const filterRow = (
        <DashboardFiltersBar
            {...props}
            // The rail is on the page: a drawer over it would hide it
            isCompactDrawerSuppressed={isSidebarOpen}
            // The flat bar's items share each line's centre with the
            // 30px funnel; the sectioned flow centres its own lines
            filtersAlign={
                hasSections || props.isEditMode ? 'flex-start' : 'center'
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
                        </>
                    )}
                </SettledFilterFields>
            }
        />
    );
    // The filter row stays, faded and inert, so the grid keeps its place and
    // the row comes back at once
    return (
        <Box className={classes.swap}>
            <Box
                className={classes.filterRow}
                data-hidden={isMapping || undefined}
                inert={isMapping || undefined}
            >
                {filterRow}
            </Box>
            {isMapping && <MappingRow />}
        </Box>
    );
};
