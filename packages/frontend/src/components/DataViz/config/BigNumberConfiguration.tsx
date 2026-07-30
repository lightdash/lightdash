import { DimensionType, type VizColumn } from '@lightdash/common';
import { Stack, Title } from '@mantine-8/core';
import { useMemo } from 'react';
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

export const BigNumberConfiguration = ({
    columns,
}: {
    columns: VizColumn[];
}) => {
    const dispatch = useVizDispatch();

    const valueField = useVizSelector(
        (state) => state.bigNumberConfig.fieldConfig?.y[0],
    );
    const metricFieldOptions = useVizSelector(
        (state) => state.bigNumberConfig.options.metricFieldOptions,
    );
    const customMetricFieldOptions = useVizSelector(
        (state) => state.bigNumberConfig.options.customMetricFieldOptions,
    );
    const errors = useVizSelector((state) => state.bigNumberConfig.errors);

    const fieldOptions = useMemo(
        () => [...metricFieldOptions, ...customMetricFieldOptions],
        [metricFieldOptions, customMetricFieldOptions],
    );

    const errorMessage = errors?.metricFieldError?.references?.[0]
        ? `Column "${errors.metricFieldError.references[0]}" not in SQL query`
        : undefined;

    return (
        <Stack gap="sm" mb="lg">
            <Title order={5} fz="sm" c="ldGray.9">
                Data
            </Title>

            <Config.Section>
                <Config.Heading>Value</Config.Heading>

                <FieldReferenceSelect
                    data={fieldOptions.map((option) => ({
                        value: option.reference,
                        label: option.reference,
                    }))}
                    disabled={fieldOptions.length === 0}
                    value={valueField?.reference}
                    error={errorMessage}
                    placeholder="Select a value"
                    onChange={(value) => {
                        if (!value) return;
                        dispatch(setValueReference(value));
                    }}
                    fieldType={
                        columns?.find(
                            (column) =>
                                column.reference === valueField?.reference,
                        )?.type ?? DimensionType.NUMBER
                    }
                />

                <Config.Group>
                    <Config.Label>Aggregation</Config.Label>

                    <DataVizAggregationConfig
                        options={
                            customMetricFieldOptions.find(
                                (option) =>
                                    option.reference === valueField?.reference,
                            )?.aggregationOptions
                        }
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
