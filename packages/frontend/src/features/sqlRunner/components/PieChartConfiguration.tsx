import { DimensionType, type SqlColumn } from '@lightdash/common';
import { Stack, Title } from '@mantine/core';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setGroupFieldIds } from '../store/pieChartSlice';
import { FieldReferenceSelect } from './FieldReferenceSelect';

export const PieChartConfiguration = ({
    sqlColumns,
}: {
    sqlColumns: SqlColumn[];
}) => {
    const dispatch = useAppDispatch();

    const groupField = useAppSelector(
        (state) => state.pieChartConfig.config?.fieldConfig?.x.reference,
    );
    const groupFieldOptions = useAppSelector(
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
