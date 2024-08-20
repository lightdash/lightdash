import { DimensionType, type VizSqlColumn } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import { useVizDispatch, useVizSelector } from '../store';
import { setGroupFieldIds } from '../store/pieChartSlice';

export const PieChartConfiguration = ({
    sqlColumns,
}: {
    sqlColumns: VizSqlColumn[];
}) => {
    const dispatch = useVizDispatch();

    const groupField = useVizSelector(
        (state) => state.pieChartConfig.config?.fieldConfig?.x.reference,
    );
    const groupFieldOptions = useVizSelector(
        (state) => state.pieChartConfig.options.groupFieldOptions,
    );

    return (
        <Stack spacing="xs" mb="lg">
            <Title order={5} fz="sm" c="gray.9">
                Data
            </Title>

            <Config.Section>
                <Config.Heading>{`Group by`}</Config.Heading>
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
                        sqlColumns?.find((x) => x.reference === groupField)
                            ?.type ?? DimensionType.STRING
                    }
                />
            </Config.Section>
        </Stack>
    );
};
