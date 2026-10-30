import { Box } from '@mantine/core';
import { type ComponentProps, type FC, type ReactNode } from 'react';
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

// The shipped bar with its filter area swapped, in edit and view mode alike
export const ControlsBar: FC<Props> = (props) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
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
    return <MappingSwap>{filterRow}</MappingSwap>;
};

// While tiles are chosen the mapping row cross-fades into the filter row's
// place. The filter row stays, faded and inert, so the grid keeps its place
// and the row comes back at once
export const MappingSwap: FC<{ children: ReactNode }> = ({ children }) => {
    const isMapping = useControlsSidebarSelector((c) => c.isMapping);
    return (
        <Box className={classes.swap}>
            <Box
                className={classes.filterRow}
                data-hidden={isMapping || undefined}
                inert={isMapping || undefined}
            >
                {children}
            </Box>
            {isMapping && <MappingRow />}
        </Box>
    );
};
