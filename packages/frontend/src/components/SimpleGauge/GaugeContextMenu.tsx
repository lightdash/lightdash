import { type ResultValue } from '@lightdash/common';
import { Box, Menu, Portal, type MenuProps } from '@mantine-8/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useMemo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import { isGaugeVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import DrillIntoSubmenu from '../MetricQueryData/DrillIntoSubmenu';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

export type GaugeContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    canViewUnderlyingData: boolean;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const GaugeContextMenu: FC<GaugeContextMenuProps> = ({
    menuPosition,
    opened,
    onOpen,
    onClose,
    canViewUnderlyingData,
}) => {
    const {
        visualizationConfig,
        resultsData,
        drillConfig,
        onDrill,
        onLinkedChartDrill,
    } = useVisualizationContext();

    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const metricQueryData = useMetricQueryDataContext(true);

    const fieldValues: Record<string, ResultValue> | undefined = useMemo(() => {
        if (!resultsData?.rows?.[0]) return undefined;
        return mapValues(resultsData.rows[0], (col) => col.value);
    }, [resultsData]);

    const gaugeValue = useMemo(() => {
        if (!isGaugeVisualizationConfig(visualizationConfig) || !fieldValues)
            return undefined;
        const { selectedField } = visualizationConfig.chartConfig;
        if (!selectedField) return undefined;
        return fieldValues[selectedField];
    }, [visualizationConfig, fieldValues]);

    if (!metricQueryData || !fieldValues) {
        return null;
    }

    const { openUnderlyingDataModal, metricQuery } = metricQueryData;

    const handleCopy = () => {
        if (gaugeValue) {
            clipboard.copy(gaugeValue.formatted);
            showToastSuccess({ title: 'Copied to clipboard!' });
        }
    };

    const handleOpenUnderlyingDataModal = () => {
        if (!isGaugeVisualizationConfig(visualizationConfig) || !gaugeValue)
            return;

        const item = visualizationConfig.chartConfig.getField(
            visualizationConfig.chartConfig.selectedField,
        );
        if (!item) return;

        openUnderlyingDataModal({
            item,
            value: gaugeValue,
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
                {gaugeValue && (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconCopy} />}
                        onClick={handleCopy}
                    >
                        Copy value
                    </Menu.Item>
                )}

                {metricQuery && canViewUnderlyingData && (
                    <UnderlyingDataMenuItem
                        metricQuery={metricQuery}
                        onViewUnderlyingData={handleOpenUnderlyingDataModal}
                    />
                )}

                {onDrill && drillConfig && (
                    <DrillIntoSubmenu
                        drillConfig={drillConfig}
                        fieldValues={fieldValues}
                        onDrill={onDrill}
                        onLinkedChartDrill={onLinkedChartDrill}
                    />
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default GaugeContextMenu;
