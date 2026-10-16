import { TooltipSortByOptions, type TooltipSortBy } from '@lightdash/common';
import { Group, Select } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';

export const TooltipSortConfig: FC = () => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig } = useVisualizationContext();
    const tooltipSortOptions = useMemo(
        () => [
            {
                value: TooltipSortByOptions.DEFAULT,
                label: t('tooltipConfig.sortDefault'),
            },
            {
                value: TooltipSortByOptions.ALPHABETICAL,
                label: t('tooltipConfig.sortAlphabetical'),
            },
            {
                value: TooltipSortByOptions.VALUE_DESCENDING,
                label: t('tooltipConfig.sortValueDescending'),
            },
            {
                value: TooltipSortByOptions.VALUE_ASCENDING,
                label: t('tooltipConfig.sortValueAscending'),
            },
        ],
        [t],
    );

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
        <Group gap="xs">
            <Config.Label>{t('tooltipConfig.sortBy')}</Config.Label>
            <Select
                data={tooltipSortOptions}
                value={tooltipSort ?? TooltipSortByOptions.DEFAULT}
                onChange={handleChange}
                w={160}
                size="xs"
            />
        </Group>
    );
};
