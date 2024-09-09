import { DimensionType, type VizColumn } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { FieldReferenceSelect } from '../../../../components/DataViz/FieldReferenceSelect';
import {
    useVizDispatch,
    useVizSelector,
} from '../../../../components/DataViz/store';
import {
    setGroupFieldIds,
    setYAxisReference,
} from '../../../../components/DataViz/store/pieChartSlice';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';

export const PieChartConfig = ({ columns }: { columns: VizColumn[] }) => {
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
                        !!groupField &&
                        groupFieldOptions.find(
                            (x) => x.reference === groupField,
                        ) === undefined &&
                        `Column "${groupField}" not in SQL query`
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
                        aggregateFieldOptions.find(
                            (y) => y.reference === aggregateField?.reference,
                        ) === undefined &&
                        `Column "${aggregateField?.reference}" not in SQL query`
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
            </Config.Section>
        </Stack>
    );
};
