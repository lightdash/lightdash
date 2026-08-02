import { type VizColumn } from '@lightdash/common';
import { Stack } from '@mantine-8/core';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import {
    setValueAggregation,
    setValueReference,
} from '../store/bigNumberSlice';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';
import { useBigNumberFieldOptions } from './useBigNumberFieldOptions';

export const BigNumberDataConfig = ({ columns }: { columns: VizColumn[] }) => {
    const dispatch = useVizDispatch();
    const valueField = useVizSelector(
        (state) => state.bigNumberConfig.fieldConfig?.y[0],
    );
    const errors = useVizSelector((state) => state.bigNumberConfig.errors);
    const { fieldOptions, selectData, fieldTypeOf, aggregationOptionsFor } =
        useBigNumberFieldOptions(columns);

    const errorMessage = errors?.metricFieldError?.references?.[0]
        ? `Column "${errors.metricFieldError.references[0]}" not in SQL query`
        : undefined;

    return (
        <Stack gap="sm" mb="lg">
            <Config.Section>
                <Config.Heading>Value</Config.Heading>

                <FieldReferenceSelect
                    data={selectData}
                    disabled={fieldOptions.length === 0}
                    value={valueField?.reference}
                    error={errorMessage}
                    placeholder="Select a value"
                    onChange={(value) => {
                        if (!value) return;
                        dispatch(setValueReference(value));
                    }}
                    fieldType={fieldTypeOf(valueField?.reference)}
                />

                <Config.Group>
                    <Config.Label>Aggregation</Config.Label>

                    <DataVizAggregationConfig
                        options={aggregationOptionsFor(valueField?.reference)}
                        aggregation={valueField?.aggregation}
                        onChangeAggregation={(value) =>
                            dispatch(setValueAggregation(value))
                        }
                    />
                </Config.Group>
            </Config.Section>
        </Stack>
    );
};
