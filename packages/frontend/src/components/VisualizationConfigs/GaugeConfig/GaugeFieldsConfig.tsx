import { getItemId } from '@lightdash/common';
import { memo, type FC } from 'react';
import { isGaugeVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../common/FieldSelect';
import { Config } from '../common/Config';

export const GaugeFieldsConfig: FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isGaugeVisualizationConfig(visualizationConfig)) {
        return null;
    }

    const {
        chartConfig: {
            selectedField: selectedFieldId,
            setSelectedField,
            getField,
        },
        numericMetrics,
    } = visualizationConfig;

    const selectedField = getField(selectedFieldId);

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Field</Config.Heading>
                <FieldSelect
                    label="Selected field"
                    description="Select a metric to display on the gauge"
                    item={selectedField}
                    items={Object.values(numericMetrics ?? {})}
                    onChange={(newValue) => {
                        setSelectedField(
                            newValue ? getItemId(newValue) : undefined,
                        );
                    }}
                    hasGrouping
                />
            </Config.Section>
        </Config>
    );
});
