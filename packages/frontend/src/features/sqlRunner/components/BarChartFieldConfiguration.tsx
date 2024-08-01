import {
    DEFAULT_AGGREGATION,
    DimensionType,
    XLayoutType,
    type GroupByLayoutOptions,
    type SqlTransformBarChartConfig,
    type XLayoutOptions,
    type YLayoutOptions,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Select, UnstyledButton } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { AddButton } from '../../../components/VisualizationConfigs/common/AddButton';
import { Config } from '../../../components/VisualizationConfigs/common/Config';
import {
    addYAxisField,
    removeYAxisField,
    setGroupByReference,
    setXAxisReference,
    setYAxisAggregation,
    setYAxisReference,
    unsetGroupByReference,
} from '../store/barChartSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { BarChartAggregationConfig } from './BarChartAggregationConfig';
import { TableFieldIcon } from './TableFields';

const YFieldsAxisConfig: FC<{
    field: SqlTransformBarChartConfig['y'][number];
    yLayoutOptions: YLayoutOptions[];
    isSingle: boolean;
    index: number;
}> = ({ field, yLayoutOptions, isSingle, index }) => {
    const { hovered, ref } = useHover();
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const [isOpen, setIsOpen] = useState(true);

    return (
        <>
            {!isSingle && (
                <Group ref={ref} position="apart">
                    <UnstyledButton
                        onClick={() => setIsOpen(!isOpen)}
                        sx={{
                            flex: 1,
                        }}
                    >
                        <Group spacing="two">
                            <MantineIcon
                                icon={
                                    isOpen ? IconChevronDown : IconChevronRight
                                }
                            />

                            <Config.Subheading>
                                {/* TODO: rename type when we have series type */}
                                Bar series {index + 1}
                            </Config.Subheading>
                        </Group>
                    </UnstyledButton>
                    <ActionIcon
                        onClick={() => {
                            dispatch(removeYAxisField(index));
                        }}
                        sx={{
                            visibility: hovered ? 'visible' : 'hidden',
                        }}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Group>
            )}

            <Box
                display={isOpen ? 'block' : 'none'}
                sx={(theme) => ({
                    paddingLeft: !isSingle ? theme.spacing.xs : 0,
                    borderLeft: !isSingle
                        ? `1px solid ${theme.colors.gray[3]}`
                        : 0,
                })}
            >
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
                                        reference: value,
                                        index,
                                        aggregation:
                                            yLayoutOptions.find(
                                                (option) =>
                                                    option.reference === value,
                                            )?.aggregationOptions[0] ??
                                            DEFAULT_AGGREGATION,
                                    }),
                                );
                            }}
                            icon={
                                <TableFieldIcon
                                    fieldType={
                                        sqlColumns?.find(
                                            (x) =>
                                                x.reference === field.reference,
                                        )?.type ?? DimensionType.STRING
                                    }
                                />
                            }
                        />

                        <Config.Group>
                            <Config.Label>Aggregation</Config.Label>

                            <BarChartAggregationConfig
                                options={
                                    yLayoutOptions.find(
                                        (layout) =>
                                            layout.reference ===
                                            field.reference,
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
                        </Config.Group>
                    </Config.Section>
                </Config>
            </Box>
        </>
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

    const groupByField = useAppSelector(
        (state) => state.barChartConfig.config?.fieldConfig?.groupBy?.[0],
    );
    const groupByLayoutOptions = useAppSelector(
        (state) => state.barChartConfig.options.groupByOptions,
    );

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
                    <Config.Group>
                        <Config.Heading>{`Y-axis`}</Config.Heading>
                        <AddButton
                            onClick={() => dispatch(addYAxisField())}
                        ></AddButton>
                    </Config.Group>
                    {yLayoutOptions &&
                        yAxisFields &&
                        yAxisFields.map((field, index) => (
                            <YFieldsAxisConfig
                                key={field.reference + index}
                                field={field}
                                yLayoutOptions={yLayoutOptions}
                                isSingle={yAxisFields.length === 1}
                                index={index}
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
        </>
    );
};
