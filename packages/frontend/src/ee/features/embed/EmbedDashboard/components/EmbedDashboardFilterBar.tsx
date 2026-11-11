import {
    canAddDashboardFiltersInEmbed,
    isParameterInteractivityEnabled,
    type Dashboard,
    type DashboardTile,
    type InteractivityOptions,
} from '@lightdash/common';
import { Box, Button, Divider, Group, Tooltip } from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    selectActiveTabUuid,
    selectControlSections,
    selectHasStoredControlOrder,
    selectDashboardFilters,
    selectDateZoomGranularity,
    selectParameterControls,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../../../../../features/dashboard/store';
import { AddControl } from '../../../../../features/dashboardControls/AddControl';
import { MappingSwap } from '../../../../../features/dashboardControls/ControlsBar';
import {
    ControlsCollapsedStrip,
    ControlsLead,
} from '../../../../../features/dashboardControls/ControlsStrip';
import { DateZoomPills } from '../../../../../features/dashboardControls/DateZoomPills';
import { FilterPills } from '../../../../../features/dashboardControls/FilterPills';
import { ParameterPills } from '../../../../../features/dashboardControls/ParameterPills';
import { SectionedFilters } from '../../../../../features/dashboardControls/SectionedFilters';
import { SettledFilterFields } from '../../../../../features/dashboardControls/SettledFilterFields';
import {
    getControlTotal,
    useControlCounts,
} from '../../../../../features/dashboardControls/useControlCounts';
import { useParameterBarControls } from '../../../../../features/dashboardControls/useParameterBarControls';
import { DashboardFiltersBarSummary } from '../../../../../features/dashboardFilters/DashboardFiltersBarSummary';
import { DateZoom } from '../../../../../features/dateZoom';
import { getDateZoomSummaryLabel } from '../../../../../features/dateZoom/utils';
import { useActiveTabParameters } from '../../../../../hooks/dashboard/useActiveTabParameters';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { embedContractClass } from '../../styles/embedClassContract';
import styles from './EmbedDashboardFilterBar.module.css';
import EmbedDashboardFilters, {
    EmbedResetFiltersButton,
} from './EmbedDashboardFilters';
import EmbedDashboardParameters from './EmbedDashboardParameters';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    shouldShowFilters: boolean;
    /** Tiles rendered on the active tab */
    activeTiles: DashboardTile[];
    isEditMode?: boolean;
    /** The filters open in the dashboard's filter rail (default false). */
    isControlsEnabled?: boolean;
};

// The filters as the rail's bar has them: "Add filter" and the pills open
// the rail, and stay on screen while it is open; a dashboard with sections
// shows them as the app's viewer bar does
const ControlsFilterArea: FC<{
    canAddFilters: boolean;
    withParameters: boolean;
    withDateZooms: boolean;
    /** The strip's start, in the flow so lines wrap back under it */
    leading: ReactNode;
}> = ({ canAddFilters, withParameters, withDateZooms, leading }) => {
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    // Sections or a stored order: the bar the app's viewers get
    const isSectioned = useDashboardSelector(
        (state) =>
            selectControlSections(state).length > 0 ||
            selectHasStoredControlOrder(state),
    );
    const getUiString = useUiStrings();
    const actions = (
        <>
            <AddControl
                triggerClassName={embedContractClass('ld-dashboard-add-filter')}
                unsavedFiltersTooltip={getUiString(
                    'filters.unsavedFiltersTooltip',
                )}
            />
            {!canAddFilters && <EmbedResetFiltersButton />}
        </>
    );
    const triggerClassName = embedContractClass('ld-dashboard-filter');
    // A tile added or removed keeps the pills, as on the app's bar
    return (
        <SettledFilterFields>
            {isSectioned ? (
                <SectionedFilters
                    activeTabUuid={activeTabUuid}
                    leading={leading}
                    viewerActions={actions}
                    triggerClassName={triggerClassName}
                    withParameters={withParameters}
                    // Date zooms are pills in the flow, as in the app
                    withDateZooms={withDateZooms}
                />
            ) : (
                <>
                    {leading}
                    {actions}
                    <FilterPills
                        activeTabUuid={activeTabUuid}
                        triggerClassName={triggerClassName}
                    />
                    {withParameters && <ParameterPills />}
                    {withDateZooms && <DateZoomPills />}
                </>
            )}
        </SettledFilterFields>
    );
};

const EmbedDashboardFilterBar: FC<Props> = ({
    dashboard,
    shouldShowFilters,
    activeTiles,
    isEditMode = false,
    isControlsEnabled = false,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const getUiString = useUiStrings();
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const dashboardTemporaryFilters = useDashboardTemporaryFilters();
    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    // With the controls, date zooms are pills in the flow, not on the right
    const withDateZoomPills =
        isControlsEnabled && dashboard.canDateZoom === true;
    const parameterControls = useDashboardSelector(selectParameterControls);
    const useParameterControls =
        isControlsEnabled && parameterControls !== null;
    const parametersEnabled = isParameterInteractivityEnabled(
        dashboard.parameterInteractivity,
    );
    // `canAddFilters` governs viewers' temporary filters; an editor can always
    // author saved filters, as in the app's edit mode.
    const canAddFilters =
        shouldShowFilters &&
        (isEditMode ||
            canAddDashboardFiltersInEmbed(
                dashboard.dashboardFiltersInteractivity,
            ));

    const totalFiltersCount = shouldShowFilters
        ? dashboardFilters.dimensions.length +
          dashboardTemporaryFilters.dimensions.length
        : 0;
    // Parameters follow the UI: only shown on tabs whose charts reference them
    const activeTabParameters = useActiveTabParameters(activeTiles);
    const parameterBar = useParameterBarControls();
    const totalParametersCount = parametersEnabled
        ? isControlsEnabled
            ? parameterBar.entries.filter(({ control }) => !control.hidden)
                  .length
            : Object.keys(activeTabParameters).length
        : 0;
    const hasVisibleParameters = totalParametersCount > 0;
    // With the controls on, the legacy parameters never show: none until the controls are built
    const showsLegacyParameters = parametersEnabled && !isControlsEnabled;
    const counts = useControlCounts();
    // What the controls strip shows, as the app's
    const controlCounts = {
        filters: shouldShowFilters ? counts.filters : 0,
        parameters: parametersEnabled ? counts.parameters : 0,
        dateZooms: withDateZoomPills ? counts.dateZooms : 0,
    };

    // Collapsing hides filters and parameters; the shipped date zoom on the
    // right stays visible, pills in the flow collapse with them as in the app
    const isCollapsible = isControlsEnabled
        ? getControlTotal(controlCounts) > 0
        : totalFiltersCount > 0 || totalParametersCount > 0;

    // Interactivity may be enabled with nothing to show (hidden filters, or
    // none defined) — render nothing rather than an empty padded row
    if (!dashboard.canDateZoom && !isCollapsible && !canAddFilters) {
        return null;
    }

    if (isCollapsible && isCollapsed) {
        return isControlsEnabled ? (
            <ControlsCollapsedStrip
                className={embedContractClass('ld-dashboard-filters')}
                counts={controlCounts}
                withDefaultZoom={withDateZoomPills}
                onExpand={() => setIsCollapsed(false)}
            />
        ) : (
            <DashboardFiltersBarSummary
                filtersCount={totalFiltersCount}
                parametersCount={totalParametersCount}
                dateZoomLabel={
                    !dashboard.canDateZoom
                        ? null
                        : getDateZoomSummaryLabel(
                              dateZoomGranularity,
                              getUiString,
                          )
                }
                onExpand={() => setIsCollapsed(false)}
            />
        );
    }

    const lead = (
        <ControlsLead
            counts={controlCounts}
            isOpen
            onToggle={() => setIsCollapsed(true)}
            withDefaultZoom={withDateZoomPills}
        />
    );
    const bar = (
        <Group
            className={embedContractClass(
                'ld-dashboard-filters',
                styles.filterBar,
            )}
            justify="space-between"
            align="flex-start"
            wrap="wrap"
            gap="sm"
            px="lg"
            py="xs"
        >
            <Group
                align="flex-start"
                wrap="wrap"
                gap="xs"
                flex="1 1 24rem"
                miw={0}
                className={isControlsEnabled ? styles.filterArea : undefined}
            >
                {/* With filters, the lead is in their flow */}
                {isControlsEnabled && !shouldShowFilters && lead}
                {shouldShowFilters &&
                    (isControlsEnabled ? (
                        <ControlsFilterArea
                            leading={lead}
                            canAddFilters={canAddFilters}
                            withParameters={
                                parametersEnabled && useParameterControls
                            }
                            withDateZooms={withDateZoomPills}
                        />
                    ) : (
                        <EmbedDashboardFilters
                            canAddFilters={canAddFilters}
                            isEditMode={isEditMode}
                        />
                    ))}
                {/* With the controls, parameters are pills among the filters */}
                {useParameterControls ? (
                    !shouldShowFilters &&
                    parametersEnabled && (
                        <Group
                            className={embedContractClass(
                                'ld-dashboard-parameters',
                            )}
                            gap="xs"
                            wrap="wrap"
                        >
                            <ParameterPills />
                        </Group>
                    )
                ) : (
                    <>
                        {shouldShowFilters &&
                            hasVisibleParameters &&
                            showsLegacyParameters && (
                                <Divider
                                    className={styles.filterParameterDivider}
                                    orientation="vertical"
                                />
                            )}
                        {showsLegacyParameters && (
                            <EmbedDashboardParameters
                                parameters={activeTabParameters}
                            />
                        )}
                    </>
                )}
                {!shouldShowFilters && withDateZoomPills && <DateZoomPills />}
            </Group>

            <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                {dashboard.canDateZoom && !isControlsEnabled && (
                    <Box
                        className={embedContractClass('ld-dashboard-date-zoom')}
                    >
                        <DateZoom
                            isEditMode={false}
                            dropdownClassName={embedContractClass(
                                'ld-dashboard-date-zoom-dropdown',
                            )}
                        />
                    </Box>
                )}
                {isCollapsible && !isControlsEnabled && (
                    <>
                        <Divider orientation="vertical" />
                        <Tooltip
                            label={getUiString('filters.summary.hideFilters')}
                        >
                            <Button
                                size="xs"
                                variant="subtle"
                                color="gray"
                                rightSection={
                                    <MantineIcon icon={IconChevronUp} />
                                }
                                onClick={() => setIsCollapsed(true)}
                            >
                                {getUiString('filters.summary.hide')}
                            </Button>
                        </Tooltip>
                    </>
                )}
            </Group>
        </Group>
    );
    // Choosing a filter's tiles: the mapping row takes the bar's place
    return isControlsEnabled ? <MappingSwap>{bar}</MappingSwap> : bar;
};

export default EmbedDashboardFilterBar;
