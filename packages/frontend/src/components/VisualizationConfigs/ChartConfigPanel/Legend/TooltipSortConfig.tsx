import { TooltipSortByOptions, type TooltipSortBy } from '@lightdash/common';
import { Group, Select } from '@mantine/core';
import { type FC } from 'react';
import {
    selectCartesianEditor,
    useVisualizationSelector,
    type VisualizationStoreState,
} from '../../../../features/visualization/store';
import { useCartesianEditorActions } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
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

const selectTooltipSort = (state: VisualizationStoreState) =>
    selectCartesianEditor(state).tooltipSort;

export const TooltipSortConfig: FC = () => {
    const tooltipSort = useVisualizationSelector(selectTooltipSort);
    const { setTooltipSort } = useCartesianEditorActions();

    const handleChange = (value: string | null) => {
        if (value === null || value === TooltipSortByOptions.DEFAULT) {
            setTooltipSort(undefined);
        } else {
            setTooltipSort(value as TooltipSortBy);
        }
    };

    return (
        <Group gap="xs">
            <Config.Label>Sort by</Config.Label>
            <Select
                data={TOOLTIP_SORT_OPTIONS}
                value={tooltipSort ?? TooltipSortByOptions.DEFAULT}
                onChange={handleChange}
                w={160}
                size="xs"
            />
        </Group>
    );
};
