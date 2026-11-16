import {
    canAddDashboardFiltersInEmbed,
    isParameterAllowedInEmbed,
    isParameterControlLockedInEmbed,
    isParameterInteractivityVisible,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardTile,
    type InteractivityOptions,
} from '@lightdash/common';
import { Box, Button, Divider, Group, Tooltip } from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
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
    DateZoomPills,
    DefaultZoomButton,
} from '../../../../../features/dashboardControls/DateZoomPills';
import { FilterPills } from '../../../../../features/dashboardControls/FilterPills';
import { ParameterPills } from '../../../../../features/dashboardControls/ParameterPills';
import { SectionedFilters } from '../../../../../features/dashboardControls/SectionedFilters';
import { SettledFilterFields } from '../../../../../features/dashboardControls/SettledFilterFields';
import { useNamedDateZoomCount } from '../../../../../features/dashboardControls/useDateZoomBar';
import { useParameterBarControls } from '../../../../../features/dashboardControls/useParameterBarControls';
import { DashboardFiltersBarSummary } from '../../../../../features/dashboardFilters/DashboardFiltersBarSummary';
import { DateZoom } from '../../../../../features/dateZoom';
import { DateZoomCrossTabFieldsLoader } from '../../../../../features/dateZoom/components/DateZoomCrossTabFieldsLoader';
import { getDateZoomSummaryLabel } from '../../../../../features/dateZoom/utils';
import { useActiveTabParameters } from '../../../../../hooks/dashboard/useActiveTabParameters';
import { getEmbedHiddenFilters } from '../../../../../providers/Dashboard/embedFilterInteractivity';
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
    /** The filters open in the dashboard's controls bar editor (default false). */
    isControlsEnabled?: boolean;
};

// The filters as the controls bar has them: "Add filter" and the pills open
// the editor, and stay on screen while it is open; a dashboard with sections
// shows them as the app's viewer bar does
const ControlsFilterArea: FC<{
    canAddFilters: boolean;
    isEditor: boolean;
    withParameters: boolean;
    withDateZooms: boolean;
    hiddenFilters: DashboardFilterRule[];
}> = ({
    canAddFilters,
    isEditor,
    withParameters,
    withDateZooms,
    hiddenFilters,
}) => {
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    // Sections or a stored order: the bar the app's viewers get
    const isSectioned = useDashboardSelector(
        (state) =>
            selectControlSections(state).length > 0 ||
            selectHasStoredControlOrder(state),
    );
    const getUiString = useUiStrings();
    const triggerClassName = embedContractClass('ld-dashboard-filter');
    // An editor's bar is the app's: always sectioned, adding only the kinds
    // this embed shows
    if (isEditor) {
        return (
            <SettledFilterFields>
                <SectionedFilters
                    activeTabUuid={activeTabUuid}
                    editorActions={
                        <AddControl
                            triggerClassName={embedContractClass(
                                'ld-dashboard-add-filter',
                            )}
                            withParameters={withParameters}
                            withDateZooms={withDateZooms}
                        />
                    }
                    triggerClassName={triggerClassName}
                    withParameters={withParameters}
                    withDateZooms={withDateZooms}
                    hiddenFilters={hiddenFilters}
                />
            </SettledFilterFields>
        );
    }
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
    // A tile added or removed keeps the pills, as on the app's bar
    return (
        <SettledFilterFields>
            {isSectioned ? (
                <SectionedFilters
                    activeTabUuid={activeTabUuid}
                    viewerActions={actions}
                    triggerClassName={triggerClassName}
                    withParameters={withParameters}
                    // Date zooms are pills in the flow, as in the app
                    withDateZooms={withDateZooms}
                />
            ) : (
                <>
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
    // Hidden parameters still apply; the viewer just doesn't see them
    const parametersEnabled = isParameterInteractivityVisible(
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
    // and, in an embed, only those the token lets the viewer change
    const tabParameters = useActiveTabParameters(activeTiles);
    const activeTabParameters = useMemo(
        () =>
            isEditMode
                ? tabParameters
                : Object.fromEntries(
                      Object.entries(tabParameters).filter(([name]) =>
                          isParameterAllowedInEmbed(
                              dashboard.parameterInteractivity,
                              name,
                          ),
                      ),
                  ),
        [tabParameters, isEditMode, dashboard.parameterInteractivity],
    );
    const parameterBar = useParameterBarControls();
    const totalParametersCount = parametersEnabled
        ? isControlsEnabled
            ? parameterBar.entries.filter(
                  ({ control }) =>
                      !control.hidden &&
                      (isEditMode ||
                          !isParameterControlLockedInEmbed(
                              dashboard.parameterInteractivity,
                              control,
                          )),
              ).length
            : Object.keys(activeTabParameters).length
        : 0;
    const hasVisibleParameters = totalParametersCount > 0;
    // With the controls on, the legacy parameters never show: none until the controls are built
    const showsLegacyParameters = parametersEnabled && !isControlsEnabled;

    const namedDateZoomCount = useNamedDateZoomCount();
    const totalDateZoomsCount = withDateZoomPills ? namedDateZoomCount : 0;

    // Collapsing hides filters, parameters and named zooms; the shipped
    // Default zoom on the right stays visible, as in the app
    const isCollapsible =
        totalFiltersCount > 0 ||
        totalParametersCount > 0 ||
        totalDateZoomsCount > 0;

    // Interactivity may be enabled with nothing to show (hidden filters, or
    // none defined) — render nothing rather than an empty padded row
    if (!dashboard.canDateZoom && !isCollapsible && !canAddFilters) {
        return null;
    }

    if (isCollapsible && isCollapsed) {
        return (
            <DashboardFiltersBarSummary
                filtersCount={totalFiltersCount}
                parametersCount={totalParametersCount}
                dateZoomsCount={totalDateZoomsCount}
                dateZoomLabel={
                    dashboard.canDateZoom
                        ? getDateZoomSummaryLabel(
                              dateZoomGranularity,
                              getUiString,
                          )
                        : null
                }
                onExpand={() => setIsCollapsed(false)}
            />
        );
    }

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
                {shouldShowFilters &&
                    (isControlsEnabled ? (
                        <ControlsFilterArea
                            canAddFilters={canAddFilters}
                            isEditor={isEditMode}
                            withParameters={
                                parametersEnabled && useParameterControls
                            }
                            withDateZooms={withDateZoomPills}
                            hiddenFilters={getEmbedHiddenFilters(dashboard)}
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
                {dashboard.canDateZoom && (
                    <Box
                        className={embedContractClass('ld-dashboard-date-zoom')}
                    >
                        {isControlsEnabled && isEditMode ? (
                            // An editor's Default zoom, as on the app's bar
                            <>
                                <DefaultZoomButton />
                                <DateZoomCrossTabFieldsLoader />
                            </>
                        ) : (
                            <DateZoom
                                isEditMode={false}
                                // Named zooms are pills in the flow
                                withControls={!isControlsEnabled}
                                dropdownClassName={embedContractClass(
                                    'ld-dashboard-date-zoom-dropdown',
                                )}
                            />
                        )}
                    </Box>
                )}
                {isCollapsible && (
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
