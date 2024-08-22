import {
    DimensionType,
    type ChartKind,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizSqlCartesianChartLayout,
    type VizSqlColumn,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { ActionIcon, Box, Group, UnstyledButton } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { AddButton } from '../../VisualizationConfigs/common/AddButton';
import { Config } from '../../VisualizationConfigs/common/Config';
import { FieldReferenceSelect } from '../FieldReferenceSelect';
import {
    useVizDispatch,
    useVizSelector,
    type CartesianChartActionsType,
} from '../store';
import { cartesianChartSelectors } from '../store/selectors';
import { DataVizAggregationConfig } from './DataVizAggregationConfig';

const YFieldsAxisConfig: FC<{
    field: VizSqlCartesianChartLayout['y'][number];
    yLayoutOptions: VizValuesLayoutOptions[];
    isSingle: boolean;
    index: number;
    actions: CartesianChartActionsType;
    sqlColumns: VizSqlColumn[];
}> = ({ field, yLayoutOptions, isSingle, index, actions, sqlColumns }) => {
    const { hovered, ref } = useHover();
    const dispatch = useVizDispatch();
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
                                Series {index + 1}
                            </Config.Subheading>
                        </Group>
                    </UnstyledButton>
                    <ActionIcon
                        onClick={() => {
                            dispatch(actions.removeYAxisField(index));
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
                        <FieldReferenceSelect
                            data={yLayoutOptions.map((y) => ({
                                value: y.reference,
                                label: y.reference,
                            }))}
                            value={field.reference}
                            error={
                                yLayoutOptions.find(
                                    (y) => y.reference === field.reference,
                                ) === undefined &&
                                `Column "${field.reference}" not in SQL query`
                            }
                            placeholder="Select Y axis"
                            onChange={(value) => {
                                if (!value) return;
                                dispatch(
                                    actions.setYAxisReference({
                                        reference: value,
                                        index,
                                    }),
                                );
                            }}
                            fieldType={
                                sqlColumns?.find(
                                    (x) => x.reference === field.reference,
                                )?.type ?? DimensionType.STRING
                            }
                        />

                        <Config.Group>
                            <Config.Label>Aggregation</Config.Label>

                            <DataVizAggregationConfig
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
                                        actions.setYAxisAggregation({
                                            index,
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
    actions,
    sqlColumns,
}: {
    sqlColumns: VizSqlColumn[];

    field: VizSqlCartesianChartLayout['x'];
    xLayoutOptions: VizIndexLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();

    return (
        <FieldReferenceSelect
            data={xLayoutOptions.map((x) => ({
                value: x.reference,
                label: x.reference,
            }))}
            value={field.reference}
            placeholder="Select X axis"
            onChange={(value) => {
                if (!value) return;
                dispatch(actions.setXAxisReference(value));
            }}
            error={
                xLayoutOptions.find((x) => x.reference === field.reference) ===
                    undefined && `Column "${field.reference}" not in SQL query`
            }
            fieldType={
                sqlColumns?.find((x) => x.reference === field.reference)
                    ?.type ?? DimensionType.STRING
            }
        />
    );
};

const GroupByFieldAxisConfig = ({
    field,
    groupByOptions = [],
    actions,
    sqlColumns,
}: {
    sqlColumns: VizSqlColumn[];

    field: undefined | { reference: string };
    groupByOptions?: VizPivotLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();
    return (
        <FieldReferenceSelect
            clearable
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
                    dispatch(actions.unsetGroupByReference());
                } else {
                    dispatch(
                        actions.setGroupByReference({
                            reference: value,
                        }),
                    );
                }
            }}
            fieldType={
                sqlColumns?.find((x) => x.reference === field?.reference)
                    ?.type ?? DimensionType.STRING
            }
        />
    );
};

export const CartesianChartFieldConfiguration = ({
    sqlColumns,
    actions,
    selectedChartType,
}: {
    selectedChartType: ChartKind;
    sqlColumns: VizSqlColumn[];

    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();
    const xLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getIndexLayoutOptions(state, selectedChartType),
    );
    const yLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getValuesLayoutOptions(
            state,
            selectedChartType,
        ),
    );
    const xAxisField = useVizSelector((state) =>
        cartesianChartSelectors.getXAxisField(state, selectedChartType),
    );
    const yAxisFields = useVizSelector((state) =>
        cartesianChartSelectors.getYAxisFields(state, selectedChartType),
    );
    const groupByField = useVizSelector((state) =>
        cartesianChartSelectors.getGroupByField(state, selectedChartType),
    );
    const groupByLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getPivotLayoutOptions(state, selectedChartType),
    );

    return (
        <>
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis`}</Config.Heading>
                    {xAxisField && xLayoutOptions && (
                        <XFieldAxisConfig
                            sqlColumns={sqlColumns}
                            field={xAxisField}
                            xLayoutOptions={xLayoutOptions}
                            actions={actions}
                        />
                    )}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>{`Y-axis`}</Config.Heading>
                        <AddButton
                            onClick={() => dispatch(actions.addYAxisField())}
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
                                actions={actions}
                                sqlColumns={sqlColumns}
                            />
                        ))}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>Group by</Config.Heading>
                    <GroupByFieldAxisConfig
                        sqlColumns={sqlColumns}
                        field={groupByField}
                        groupByOptions={groupByLayoutOptions}
                        actions={actions}
                    />
                </Config.Section>
            </Config>
        </>
    );
};
