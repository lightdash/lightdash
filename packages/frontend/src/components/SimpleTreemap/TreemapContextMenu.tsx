import { type ResultValue } from '@lightdash/common';
import { Box, Menu, Portal, type MenuProps } from '@mantine-8/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import { isTreemapVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import DrillIntoSubmenu from '../MetricQueryData/DrillIntoSubmenu';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

export type TreemapContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    value?: ResultValue;
    fieldValues?: Record<string, ResultValue>;
    canViewUnderlyingData: boolean;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const TreemapContextMenu: FC<TreemapContextMenuProps> = ({
    menuPosition,
    value,
    fieldValues,
    opened,
    onOpen,
    onClose,
    canViewUnderlyingData,
}) => {
    const {
        visualizationConfig,
        drillConfig,
        onDrillDown,
        onDrillThrough,
        drillStack,
    } = useVisualizationContext();

    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const metricQueryData = useMetricQueryDataContext(true);

    if (!value || !metricQueryData) {
        return null;
    }

    const { openUnderlyingDataModal, metricQuery } = metricQueryData;

    const handleCopy = () => {
        if (value) {
            clipboard.copy(value.formatted);
            showToastSuccess({
                title: 'Copied to clipboard!',
            });
        }
    };

    const handleOpenUnderlyingDataModal = () => {
        if (!fieldValues || !isTreemapVisualizationConfig(visualizationConfig))
            return;

        const { chartConfig } = visualizationConfig;
        if (!chartConfig.selectedSizeMetric) return;

        openUnderlyingDataModal({
            item: chartConfig.selectedSizeMetric,
            value,
            fieldValues,
        });
    };

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
                        style={{
                            position: 'absolute',
                            ...(menuPosition ?? {}),
                        }}
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

                {onDrillDown && drillConfig && (
                    <DrillIntoSubmenu
                        drillConfig={drillConfig}
                        fieldValues={fieldValues}
                        drillStack={drillStack}
                        onDrillDown={onDrillDown}
                        onDrillThrough={onDrillThrough}
                    />
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default TreemapContextMenu;
