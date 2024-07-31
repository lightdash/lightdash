import {
    DEFAULT_AGGREGATION,
    DimensionType,
    XLayoutType,
    type GroupByLayoutOptions,
    type SqlTransformBarChartConfig,
    type XLayoutOptions,
    type YLayoutOptions,
} from '@lightdash/common';
import { Group, Select } from '@mantine/core';
import debounce from 'lodash/debounce';
import { type FC } from 'react';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import {
    setGroupByReference,
    setSeriesLabel,
    setXAxisReference,
    setYAxisAggregation,
    setYAxisReference,
    unsetGroupByReference,
} from '../store/barChartSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { BarChartAggregationConfig } from './BarChartAggregationConfig';
import { TableFieldIcon } from './TableFields';

const DEBOUNCE_TIME = 500;

const YFieldsAxisConfig: FC<{
    field: SqlTransformBarChartConfig['y'][number];
    yLayoutOptions: YLayoutOptions[];
}> = ({ field, yLayoutOptions }) => {
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);

    return (
        <Config>
            <Config.Section>
                <Select
                    radius="md"
                    data={yLayoutOptions.map((y) => ({
                        value: y.reference,
                        label: y.reference,
                    }))}
                    value={field.reference}
                    error={
                        yLayoutOptions.find(
                            (y) => y.reference === field.reference,
                        ) === undefined &&
                        `Column "${field.reference}" not in SQL`
                    }
                    placeholder="Select Y axis"
                    onChange={(value) => {
                        if (!value) return;
                        dispatch(
                            setYAxisReference({
                                previousReference: field.reference,
                                reference: value,
                                aggregation:
                                    yLayoutOptions.find(
                                        (option) => option.reference === value,
                                    )?.aggregationOptions[0] ??
                                    DEFAULT_AGGREGATION,
                            }),
                        );
                    }}
                    icon={
                        <TableFieldIcon
                            fieldType={
                                sqlColumns?.find(
                                    (x) => x.reference === field.reference,
                                )?.type ?? DimensionType.STRING
                            }
                        />
                    }
                />

                <Group noWrap spacing="xs">
                    <Config.Label>Aggregation</Config.Label>

                    <BarChartAggregationConfig
                        options={
                            yLayoutOptions.find(
                                (layout) =>
                                    layout.reference === field.reference,
                            )?.aggregationOptions
                        }
                        aggregation={field.aggregation}
                        onChangeAggregation={(value) =>
                            dispatch(
                                setYAxisAggregation({
                                    reference: field.reference,
                                    aggregation: value,
                                }),
                            )
                        }
                    />
                </Group>
            </Config.Section>
        </Config>
    );
};

const XFieldAxisConfig = ({
    field,
    xLayoutOptions,
}: {
    field: SqlTransformBarChartConfig['x'];
    xLayoutOptions: XLayoutOptions[];
}) => {
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);

    return (
        <Select
            radius="md"
            data={xLayoutOptions.map((x) => ({
                value: x.reference,
                label: x.reference,
            }))}
            value={field.reference}
            placeholder="Select X axis"
            onChange={(value) => {
                if (!value) return;
                dispatch(
                    setXAxisReference({
                        reference: value,
                        type:
                            xLayoutOptions.find((x) => x.reference === value)
                                ?.type ?? XLayoutType.CATEGORY,
                    }),
                );
            }}
            error={
                xLayoutOptions.find((x) => x.reference === field.reference) ===
                    undefined && `Column "${field.reference}" not in SQL query`
            }
            icon={
                <TableFieldIcon
                    fieldType={
                        sqlColumns?.find((x) => x.reference === field.reference)
                            ?.type ?? DimensionType.STRING
                    }
                />
            }
        />
    );
};

const GroupByFieldAxisConfig = ({
    field,
    groupByOptions,
}: {
    field: undefined | { reference: string };
    groupByOptions: GroupByLayoutOptions[];
}) => {
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    return (
        <Select
            radius="md"
            data={groupByOptions.map((groupBy) => ({
                value: groupBy.reference,
                label: groupBy.reference,
            }))}
            value={field?.reference ?? null}
            placeholder="Select group by"
            error={
                field !== undefined &&
                !groupByOptions.find((x) => x.reference === field.reference) &&
                `Column "${field.reference}" not in SQL query`
            }
            onChange={(value) => {
                if (!value) {
                    dispatch(unsetGroupByReference());
                } else {
                    dispatch(
                        setGroupByReference({
                            reference: value,
                        }),
                    );
                }
            }}
            icon={
                field?.reference ? (
                    <TableFieldIcon
                        fieldType={
                            sqlColumns?.find(
                                (x) => x.reference === field?.reference,
                            )?.type ?? DimensionType.STRING
                        }
                    />
                ) : null
            }
            clearable
        />
    );
};

export const BarChartFieldConfiguration = () => {
    const dispatch = useAppDispatch();
    const xLayoutOptions = useAppSelector(
        (state) => state.barChartConfig.options.xLayoutOptions,
    );
    const yLayoutOptions = useAppSelector(
        (state) => state.barChartConfig.options.yLayoutOptions,
    );

    const xAxisField = useAppSelector(
        (state) => state.barChartConfig.config?.fieldConfig?.x,
    );
    const yAxisFields = useAppSelector(
        (state) => state.barChartConfig.config?.fieldConfig?.y,
    );

    const series = useAppSelector(
        (state) => state.barChartConfig.config?.display?.series,
    );
    const groupByField = useAppSelector(
        (state) => state.barChartConfig.config?.fieldConfig?.groupBy?.[0],
    );
    const groupByLayoutOptions = useAppSelector(
        (state) => state.barChartConfig.options.groupByOptions,
    );

    const onSeriesLabelChange = debounce((reference: string, label: string) => {
        dispatch(setSeriesLabel({ reference, label }));
    }, DEBOUNCE_TIME);

    return (
        <>
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis`}</Config.Heading>
                    {xAxisField && xLayoutOptions && (
                        <XFieldAxisConfig
                            field={xAxisField}
                            xLayoutOptions={xLayoutOptions}
                        />
                    )}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{`Y-axis`}</Config.Heading>

                    {yLayoutOptions &&
                        yAxisFields &&
                        yAxisFields.map((field) => (
                            <YFieldsAxisConfig
                                key={field.reference}
                                field={field}
                                yLayoutOptions={yLayoutOptions}
                            />
                        ))}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>Group by</Config.Heading>
                    <GroupByFieldAxisConfig
                        field={groupByField}
                        groupByOptions={groupByLayoutOptions}
                    />
                </Config.Section>
            </Config>
            {series && (
                <Config>
                    <Config.Heading>Series</Config.Heading>
                    {Object.entries(series).map(([reference, { label }]) => (
                        <EditableText
                            key={reference}
                            defaultValue={label ?? reference}
                            onChange={(e) =>
                                onSeriesLabelChange(reference, e.target.value)
                            }
                        />
                    ))}
                </Config>
            )}
        </>
    );
};
