import { TooltipSortByOptions, type TooltipSortBy } from '@lightdash/common';
import { Group, Select } from '@mantine/core';
import { type FC } from 'react';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';

const TOOLTIP_SORT_OPTIONS = [
    { value: TooltipSortByOptions.DEFAULT, label: 'Default' },
    { value: TooltipSortByOptions.ALPHABETICAL, label: 'Alphabetical' },
    {
        value: TooltipSortByOptions.VALUE_DESCENDING,
        label: 'Value (descending)',
    },
    { value: TooltipSortByOptions.VALUE_ASCENDING, label: 'Value (ascending)' },
];

export const TooltipSortConfig: FC = () => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { tooltipSort, setTooltipSort } = visualizationConfig.chartConfig;

    const handleChange = (value: string | null) => {
        if (value === null || value === TooltipSortByOptions.DEFAULT) {
            setTooltipSort(undefined);
        } else {
            setTooltipSort(value as TooltipSortBy);
        }
    };

    return (
        <Group spacing="xs">
            <Config.Label>Sort by</Config.Label>
            <Select
                data={TOOLTIP_SORT_OPTIONS}
                value={tooltipSort ?? TooltipSortByOptions.DEFAULT}
                onChange={handleChange}
                w={160}
            />
        </Group>
    );
};
