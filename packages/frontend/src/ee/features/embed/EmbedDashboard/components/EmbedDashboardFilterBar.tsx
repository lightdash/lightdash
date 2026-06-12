import {
    isParameterInteractivityEnabled,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { Box, Button, Divider, Group, Tooltip } from '@mantine-8/core';
import { IconChevronUp } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { DashboardFiltersBarSummary } from '../../../../../features/dashboardFilters/DashboardFiltersBarSummary';
import { DateZoom } from '../../../../../features/dateZoom';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import EmbedDashboardFilters from './EmbedDashboardFilters';
import EmbedDashboardParameters from './EmbedDashboardParameters';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    shouldShowFilters: boolean;
};

const EmbedDashboardFilterBar: FC<Props> = ({
    dashboard,
    shouldShowFilters,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const parameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );

    const parametersEnabled = isParameterInteractivityEnabled(
        dashboard.parameterInteractivity,
    );

    const totalFiltersCount = shouldShowFilters
        ? dashboardFilters.dimensions.length +
          dashboardTemporaryFilters.dimensions.length
        : 0;
    const totalParametersCount = useMemo(
        () =>
            parametersEnabled
                ? Object.keys(parameterDefinitions).filter((key) =>
                      parameterReferences.has(key),
                  ).length
                : 0,
        [parametersEnabled, parameterDefinitions, parameterReferences],
    );

    // Collapsing only hides filters and parameters — date zoom stays visible
    const isCollapsible = totalFiltersCount > 0 || totalParametersCount > 0;

    // Interactivity may be enabled with nothing to show (hidden filters, or
    // none defined) — render nothing rather than an empty padded row
    if (!dashboard.canDateZoom && !isCollapsible) {
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
                gap="sm"
                style={{ flex: 1, minWidth: 0 }}
            >
                {shouldShowFilters && <EmbedDashboardFilters />}
                {parametersEnabled && <EmbedDashboardParameters />}
            </Group>

            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                {dashboard.canDateZoom && (
                    <Box>
                        <DateZoom isEditMode={false} />
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
