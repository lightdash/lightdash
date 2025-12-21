import { ChartType } from '@lightdash/common';
import { ActionIcon, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import { useVisualizationContext } from './LightdashVisualization/useVisualizationContext';
import ChartDownloadOptions from './common/ChartDownload/ChartDownloadOptions';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from './common/CollapsableCard/constants';
import MantineIcon from './common/MantineIcon';

type ChartDownloadMenuProps = {
    projectUuid: string;
};

const SUPPORTED_CHART_TYPES = new Set<ChartType>([
    ChartType.CARTESIAN,
    ChartType.PIE,
    ChartType.FUNNEL,
    ChartType.TREEMAP,
    ChartType.GAUGE,
]);

export const ChartDownloadMenu: React.FC<ChartDownloadMenuProps> = memo(
    ({ projectUuid: _projectUuid }) => {
        const { chartRef, resultsData, visualizationConfig } =
            useVisualizationContext();

        const getChartInstance = useCallback(
            () => chartRef.current?.getEchartsInstance(),
            [chartRef],
        );

        const supportsDownload = SUPPORTED_CHART_TYPES.has(
            visualizationConfig.chartType,
        );

        if (!supportsDownload) {
            return null;
        }

        const hasResults = (resultsData?.rows?.length ?? 0) > 0;
        const disabled = !hasResults;

        return (
            <Popover
                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                disabled={disabled}
                position="bottom-end"
            >
                <Popover.Target>
                    <ActionIcon
                        data-testid="export-chart-button"
                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                        disabled={disabled}
                    >
                        <MantineIcon icon={IconShare2} color="gray" />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                    {!disabled ? (
                        <ChartDownloadOptions
                            getChartInstance={getChartInstance}
                        />
                    ) : null}
                </Popover.Dropdown>
            </Popover>
        );
    },
);
