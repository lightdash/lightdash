import {
    createDashboardFilterRuleFromField,
    isDimension,
    isFilterableDimension,
    type FilterDashboardToRule,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { Menu, type MenuProps } from '@mantine-8/core';
import { Box, Portal } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import { useLocation, useParams } from 'react-router';
import { FilterDashboardTo } from '../../features/dashboardFilters/FilterDashboardTo';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import { isPieVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

export type PieChartContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    value?: ResultValue;
    rows?: ResultRow[];
    canViewUnderlyingData: boolean;
} & Pick<MenuProps, 'position' | 'opened' | 'onOpen' | 'onClose'>;

const PieChartContextMenu: FC<PieChartContextMenuProps> = ({
    menuPosition,
    value,
    rows,
    opened,
    onOpen,
    onClose,
    canViewUnderlyingData,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { visualizationConfig } = useVisualizationContext();
    const location = useLocation();
    const isDashboardPage = location.pathname.includes('/dashboards');

    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const metricQueryData = useMetricQueryDataContext(true);
    const { itemsMap } = useVisualizationContext();

    if (!value || !metricQueryData || !project) {
        return null;
    }

    const { openUnderlyingDataModal, metricQuery } = metricQueryData;

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const { chartConfig } = visualizationConfig;

    const handleCopy = () => {
        if (value) {
            clipboard.copy(value.formatted);
            showToastSuccess({
                title: 'Copied to clipboard!',
            });
        }
    };

    const handleOpenUnderlyingDataModal = () => {
        if (!chartConfig.selectedMetric) return;

        const fieldValues = chartConfig.groupFieldIds.reduce<
            Record<string, ResultValue>
        >((acc, fieldId) => {
            if (!fieldId) return acc;

            const fieldValue = rows?.[0]?.[fieldId]?.value;
            if (!fieldValue) return acc;

            return { ...acc, [fieldId]: fieldValue };
        }, {});

        openUnderlyingDataModal({
            item: chartConfig.selectedMetric,
            value,
            fieldValues,
        });
    };

    const filters =
        isDashboardPage && itemsMap && rows && rows.length > 0
            ? Object.entries(rows[0]).reduce<FilterDashboardToRule[]>(
                  (acc, [key, v]) => {
                      const field = itemsMap[key];
                      if (isDimension(field) && isFilterableDimension(field)) {
                          const f = createDashboardFilterRuleFromField({
                              field,
                              availableTileFilters: {},
                              isTemporary: true,
                              value: v.value.raw,
                          });
                          return [...acc, f];
                      }
                      return acc;
                  },
                  [],
              )
            : [];

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withinPortal
            shadow="md"
            closeOnItemClick
            closeOnEscape
            radius={0}
            position="right-start"
            offset={{
                mainAxis: 0,
                crossAxis: 0,
            }}
        >
            <Portal>
                <Menu.Target>
                    <Box
                        sx={{ position: 'absolute', ...(menuPosition ?? {}) }}
                    />
                </Menu.Target>
            </Portal>

            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconCopy} />}
                    onClick={handleCopy}
                >
                    Copy value
                </Menu.Item>

                {metricQuery && canViewUnderlyingData && (
                    <UnderlyingDataMenuItem
                        metricQuery={metricQuery}
                        onViewUnderlyingData={handleOpenUnderlyingDataModal}
                    />
                )}
                {isDashboardPage && (
                    <FilterDashboardTo filters={filters ?? []} />
                )}
                {/* TODO: implement drill-into functionality when ready */}
            </Menu.Dropdown>
        </Menu>
    );
};

export default PieChartContextMenu;
