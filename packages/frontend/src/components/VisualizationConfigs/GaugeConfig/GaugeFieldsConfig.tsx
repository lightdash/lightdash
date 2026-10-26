import { getItemId } from '@lightdash/common';
import { memo, type FC } from 'react';
import {
    getGaugeItem,
    selectNumericMetricsAndTableCalculations,
    selectGaugeSelectedField,
} from '../../../features/visualization/store';
import { useGaugeEditorActions } from '../../../hooks/useGaugeChartConfig';
import FieldSelect from '../../common/FieldSelect';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const GaugeFieldsConfig: FC = memo(() => {
    const { itemsMap } = useVisualizationInputs();
    const numericMetrics = useVisualizationInputSelector(
        selectNumericMetricsAndTableCalculations,
    );
    const selectedFieldId = useVisualizationInputSelector(
        selectGaugeSelectedField,
    );
    const { setSelectedField } = useGaugeEditorActions();

    const selectedField = getGaugeItem(itemsMap, selectedFieldId);

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Field</Config.Heading>
                <FieldSelect
                    label="Selected field"
                    description="Select a metric to display on the gauge"
                    item={selectedField}
                    items={Object.values(numericMetrics)}
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
