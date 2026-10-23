import {
    canAddDashboardFiltersInEmbed,
    isParameterInteractivityEnabled,
    type Dashboard,
    type DashboardTile,
    type InteractivityOptions,
} from '@lightdash/common';
import { Box, Button, Divider, Group, Tooltip } from '@mantine/core';
import { IconChevronUp } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    selectActiveTabUuid,
    selectDashboardFilters,
    selectDateZoomGranularity,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../../../../../features/dashboard/store';
import { AddControl } from '../../../../../features/dashboardControls/AddControl';
import { EditingStrip } from '../../../../../features/dashboardControls/EditingStrip';
import { FilterPills } from '../../../../../features/dashboardControls/FilterPills';
import { useControlsSidebarSelector } from '../../../../../features/dashboardControls/useControlsSidebar';
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

// The filters as the rail's bar has them: "Add filter" and the pills open the
// rail, and while it is open the bar says what is being edited
const ControlsFilterArea: FC<{ canAddFilters: boolean }> = ({
    canAddFilters,
}) => {
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const getUiString = useUiStrings();
    if (isRailOpen) return <EditingStrip />;
    return (
        <>
            <AddControl
                placement="bar"
                triggerClassName={embedContractClass('ld-dashboard-add-filter')}
                unsavedFiltersTooltip={getUiString(
                    'filters.unsavedFiltersTooltip',
                )}
            />
            {!canAddFilters && <EmbedResetFiltersButton />}
            <FilterPills
                activeTabUuid={activeTabUuid}
                triggerClassName={embedContractClass('ld-dashboard-filter')}
            />
        </>
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
    const totalParametersCount = parametersEnabled
        ? Object.keys(activeTabParameters).length
        : 0;
    const hasVisibleParameters = totalParametersCount > 0;

    // Collapsing only hides filters and parameters — date zoom stays visible
    const isCollapsible = totalFiltersCount > 0 || totalParametersCount > 0;

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

    return (
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
            >
                {shouldShowFilters &&
                    (isControlsEnabled ? (
                        <ControlsFilterArea canAddFilters={canAddFilters} />
                    ) : (
                        <EmbedDashboardFilters
                            canAddFilters={canAddFilters}
                            isEditMode={isEditMode}
                        />
                    ))}
                {shouldShowFilters && hasVisibleParameters && (
                    <Divider
                        className={styles.filterParameterDivider}
                        orientation="vertical"
                    />
                )}
                {parametersEnabled && (
                    <EmbedDashboardParameters
                        parameters={activeTabParameters}
                    />
                )}
            </Group>

            <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                {dashboard.canDateZoom && (
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
};

export default EmbedDashboardFilterBar;
