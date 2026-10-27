import { EMPTY_DATE_ZOOM_CONFIG } from '@lightdash/common';
import { Button } from '@mantine/core';
import { useCallback, useMemo, type ComponentProps, type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectControlSections,
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import dateZoomClasses from '../dateZoom/components/DateZoom.module.css';
import { type ControlPillOpening } from '../dateZoom/components/DateZoomControlPills';
import { AddControl, InertWhileEditing } from './AddControl';
import { ChangedDot } from './ChangedDot';
import { FilterPills } from './FilterPills';
import pillClasses from './FilterPills.module.css';
import { SectionedFilters } from './SectionedFilters';
import { SectionsTip } from './SectionsTip';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useZoomTileHover } from './useTileHover';
import { isZoomChanged } from './zoomState';

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBar>,
    'filterArea' | 'isCompactDrawerSuppressed' | 'dateZoomProps'
>;

// The shipped date zoom with its openings: an editor's named pills open in
// the rail, "Add date zoom" starts one there, and both modes say the
// default's grain
const useDateZoomProps = (isEditMode: boolean) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const editedZoomUuid = useControlsSidebarSelector((c) =>
        c.editing?.kind === 'dateZoom' ? c.editing.controlUuid : null,
    );
    const openZoom = useControlsSidebarSelector((c) => c.openZoom);
    const openNewZoom = useControlsSidebarSelector((c) => c.openNewZoom);
    const config = useDashboardDateZoomConfig();
    const savedConfig =
        useDashboardContext((c) => c.dashboard?.config?.dateZoomConfig) ??
        EMPTY_DATE_ZOOM_CONFIG;
    const getHoverProps = useZoomTileHover(isEditMode && !isSidebarOpen);
    const getControlPillProps = useCallback(
        (controlUuid: string): ControlPillOpening => {
            const isSelected = controlUuid === editedZoomUuid;
            return {
                buttonProps: {
                    ...getHoverProps(controlUuid),
                    'aria-pressed': isSelected,
                    className: isSelected ? pillClasses.selectedZoomPill : '',
                    'data-controls-pill': controlUuid,
                },
                corner: isZoomChanged(savedConfig, config, controlUuid) ? (
                    <ChangedDot isCorner />
                ) : null,
            };
        },
        [editedZoomUuid, getHoverProps, savedConfig, config],
    );
    const addControl = useMemo(
        () => (
            <InertWhileEditing>
                <Button
                    size="xs"
                    variant="default"
                    classNames={{ root: dateZoomClasses.addControl }}
                    onClick={openNewZoom}
                >
                    Add date zoom
                </Button>
            </InertWhileEditing>
        ),
        [openNewZoom],
    );
    return {
        onOpenControl: openZoom,
        getControlPillProps,
        addControl,
        isDefaultValueShown: true,
    };
};

// The shipped bar with its filter area swapped, in edit and view mode alike.
// It stays on screen while a filter is edited in the rail
export const ControlsBar: FC<Props> = (props) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const dateZoomProps = useDateZoomProps(props.isEditMode);
    const hasSections = useDashboardSelector(
        (state) => selectControlSections(state).length > 0,
    );
    return (
        <>
            {props.isEditMode && <SectionsTip />}
            <DashboardFiltersBar
                {...props}
                dateZoomProps={dateZoomProps}
                // The rail is on the page: a drawer over it would hide it
                isCompactDrawerSuppressed={isSidebarOpen}
                filterArea={
                    // An editor's bar is always sectioned: its selection starts the first section
                    hasSections || props.isEditMode ? (
                        <SectionedFilters activeTabUuid={props.activeTabUuid} />
                    ) : (
                        <>
                            <AddControl />
                            <FilterPills activeTabUuid={props.activeTabUuid} />
                        </>
                    )
                }
            />
        </>
    );
};
