import { DimensionType, type VizColumn } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import { useVizDispatch, useVizSelector } from '../store';
import {
    setGroupFieldIds,
    setYAxisAggregation,
    setYAxisReference,
} from '../store/pieChartSlice';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';

export const PieChartConfiguration = ({
    columns,
}: {
    columns: VizColumn[];
}) => {
    const dispatch = useVizDispatch();

    const groupField = useVizSelector(
        (state) => state.pieChartConfig.config?.fieldConfig?.x?.reference,
    );
    const groupFieldOptions = useVizSelector(
        (state) => state.pieChartConfig.options.groupFieldOptions,
    );

    const aggregateField = useVizSelector(
        (state) => state.pieChartConfig.config?.fieldConfig?.y[0],
    );

    const aggregateFieldOptions = useVizSelector(
        (state) => state.pieChartConfig.options.metricFieldOptions,
    );

    const errors = useVizSelector((state) => state.pieChartConfig.errors);

    return (
        <Stack spacing="sm" mb="lg">
            <Title order={5} fz="sm" c="gray.9">
                Data
            </Title>

            <Config.Section>
                <Config.Heading>Group by</Config.Heading>

                <FieldReferenceSelect
                    data={groupFieldOptions.map((x) => ({
                        value: x.reference,
                        label: x.reference,
                    }))}
                    disabled={groupFieldOptions.length === 0}
                    value={groupField}
                    placeholder="Select group by"
                    onChange={(value) => {
                        if (!value) return;
                        const field = groupFieldOptions.find(
                            (x) => x.reference === value,
                        );
                        if (!field) return;
                        dispatch(setGroupFieldIds(field));
                    }}
                    error={
                        errors?.groupByFieldError?.references
                            ? `Column "${errors?.groupByFieldError?.references[0]}" not in SQL query`
                            : undefined
                    }
                    fieldType={
                        columns?.find((x) => x.reference === groupField)
                            ?.type ?? DimensionType.STRING
                    }
                />
            </Config.Section>

            <Config.Section>
                <Config.Heading>Aggregate by</Config.Heading>

                <FieldReferenceSelect
                    data={aggregateFieldOptions.map((y) => ({
                        value: y.reference,
                        label: y.reference,
                    }))}
                    value={aggregateField?.reference}
                    error={
                        errors?.valuesFieldError?.references
                            ? `Column "${errors?.valuesFieldError?.references[0]}" not in SQL query`
                            : undefined
                    }
                    placeholder="Select Y axis"
                    onChange={(value) => {
                        if (!value) return;
                        dispatch(
                            setYAxisReference({
                                reference: value,
                                index: 0,
                            }),
                        );
                    }}
                    fieldType={
                        columns?.find(
                            (x) => x.reference === aggregateField?.reference,
                        )?.type ?? DimensionType.STRING
                    }
                />

                <Config.Group>
                    <Config.Label>Aggregation</Config.Label>

                    <DataVizAggregationConfig
                        options={
                            aggregateFieldOptions.find(
                                (layout) =>
                                    layout.reference ===
                                    aggregateField?.reference,
                            )?.aggregationOptions
                        }
                        aggregation={aggregateField?.aggregation}
                        onChangeAggregation={(value) => {
                            dispatch(
                                setYAxisAggregation({
                                    index: 0,
                                    aggregation: value,
                                }),
                            );
                        }}
                    />
                </Config.Group>
            </Config.Section>
        </Stack>
    );
};
