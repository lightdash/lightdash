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
import { DashboardFiltersBarSummary } from '../../../../../features/dashboardFilters/DashboardFiltersBarSummary';
import { DateZoom } from '../../../../../features/dateZoom';
import { useActiveTabParameters } from '../../../../../hooks/dashboard/useActiveTabParameters';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import { embedContractClass } from '../../styles/embedClassContract';
import styles from './EmbedDashboardFilterBar.module.css';
import EmbedDashboardFilters from './EmbedDashboardFilters';
import EmbedDashboardParameters from './EmbedDashboardParameters';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    shouldShowFilters: boolean;
    /** Tiles rendered on the active tab */
    activeTiles: DashboardTile[];
};

const EmbedDashboardFilterBar: FC<Props> = ({
    dashboard,
    shouldShowFilters,
    activeTiles,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const parametersEnabled = isParameterInteractivityEnabled(
        dashboard.parameterInteractivity,
    );
    const canAddFilters =
        shouldShowFilters &&
        canAddDashboardFiltersInEmbed(dashboard.dashboardFiltersInteractivity);

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
                        ? dateZoomGranularity || 'Default'
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
            wrap="nowrap"
            gap="sm"
            px="lg"
            py="xs"
        >
            <Group
                align="flex-start"
                wrap="wrap"
                gap="xs"
                style={{ flex: 1, minWidth: 0 }}
            >
                {shouldShowFilters && (
                    <EmbedDashboardFilters canAddFilters={canAddFilters} />
                )}
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

            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
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
                        <Tooltip label="Hide filters" withinPortal>
                            <Button
                                size="xs"
                                variant="subtle"
                                color="gray"
                                rightSection={
                                    <MantineIcon icon={IconChevronUp} />
                                }
                                onClick={() => setIsCollapsed(true)}
                            >
                                Hide
                            </Button>
                        </Tooltip>
                    </>
                )}
            </Group>
        </Group>
    );
};

export default EmbedDashboardFilterBar;
