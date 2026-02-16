import { type ResultRow, type ResultValue } from '@lightdash/common';
import { Menu, type MenuProps } from '@mantine-8/core';
import { Box, Portal } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import { isFunnelVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

export type FunnelChartContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    value?: ResultValue;
    rows?: ResultRow[];
    canViewUnderlyingData: boolean;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const FunnelChartContextMenu: FC<FunnelChartContextMenuProps> = ({
    menuPosition,
    value,
    rows,
    opened,
    onOpen,
    onClose,
    canViewUnderlyingData,
}) => {
    const { visualizationConfig } = useVisualizationContext();

    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const metricQueryData = useMetricQueryDataContext(true);

    if (!value || !metricQueryData) {
        return null;
    }

    const { openUnderlyingDataModal, metricQuery } = metricQueryData;

    if (!isFunnelVisualizationConfig(visualizationConfig)) return null;

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
        if (!chartConfig.selectedField || !rows) return;

        const fieldValues = Object.keys(rows[0]).reduce<
            Record<string, ResultValue>
        >((acc, key) => {
            return { ...acc, [key]: rows[0][key].value };
        }, {});

        openUnderlyingDataModal({
            item: chartConfig.selectedField,
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
            </Menu.Dropdown>
        </Menu>
    );
};

export default FunnelChartContextMenu;
