import { PieChartValueLabel, PieChartValueLabels } from '@lightdash/common';
import { Select, Stack } from '@mantine/core';
import React from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

const PieChartSeriesConfig: React.FC = () => {
    const {
        pieChartConfig: { valueLabel, valueLabelChange },
    } = useVisualizationContext();

    return (
        <Stack>
            <Select
                label="Value labels"
                value={valueLabel}
                data={Object.entries(PieChartValueLabels).map(
                    ([value, label]) => ({
                        value,
                        label,
                    }),
                )}
                onChange={(newValueLabel: PieChartValueLabel) => {
                    valueLabelChange(newValueLabel);
                }}
            />
        </Stack>
    );
};

export default PieChartSeriesConfig;
