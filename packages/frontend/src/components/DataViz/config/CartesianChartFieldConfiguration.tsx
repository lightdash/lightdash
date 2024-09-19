import {
    DimensionType,
    SortByDirection,
    type ChartKind,
    type VizChartLayout,
    type VizColumn,
    type VizConfigErrors,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { ActionIcon, Box, Select, Stack } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type FC } from 'react';
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
    field: VizChartLayout['y'][number];
    yLayoutOptions: VizValuesLayoutOptions[];
    isSingle: boolean;
    index: number;
    actions: CartesianChartActionsType;
    columns: VizColumn[];
    error:
        | NonNullable<VizConfigErrors['valuesFieldError']>['references'][number]
        | undefined;
}> = ({ field, yLayoutOptions, isSingle, index, actions, columns, error }) => {
    const dispatch = useVizDispatch();

    return (
        <>
            <Box
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
                            clearable
                            data={yLayoutOptions.map((y) => ({
                                value: y.reference,
                                label: y.reference,
                            }))}
                            value={field.reference}
                            error={
                                !!error &&
                                `Column "${error}" does not exist. Choose another`
                            }
                            placeholder="Select Y axis"
                            onChange={(value) => {
                                if (!value) {
                                    dispatch(actions.removeYAxisField(index));
                                } else
                                    dispatch(
                                        actions.setYAxisReference({
                                            reference: value,
                                            index,
                                        }),
                                    );
                            }}
                            fieldType={
                                columns?.find(
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
    columns,
    error,
}: {
    columns: VizColumn[];
    field: VizChartLayout['x'] | undefined;
    xLayoutOptions: VizIndexLayoutOptions[];
    actions: CartesianChartActionsType;
    error: VizConfigErrors['indexFieldError'];
}) => {
    const dispatch = useVizDispatch();

    return (
        <>
            <FieldReferenceSelect
                clearable
                data={xLayoutOptions.map((x) => ({
                    value: x.reference,
                    label: x.reference,
                }))}
                value={field?.reference ?? null}
                placeholder="Select X axis"
                onChange={(value) => {
                    if (!value) {
                        dispatch(actions.removeXAxisField());
                    } else dispatch(actions.setXAxisReference(value));
                }}
                error={
                    error &&
                    `Column "${error.reference}" does not exist. Choose another`
                }
                fieldType={
                    (field?.reference &&
                        columns?.find((x) => x.reference === field.reference)
                            ?.type) ||
                    DimensionType.STRING
                }
            />
            {field?.reference && (
                <Config.Group>
                    <Config.Label>Sort by</Config.Label>
                    <Select
                        radius="md"
                        placeholder="Select sort option"
                        data={[
                            {
                                value: SortByDirection.ASC,
                                label: 'Ascending',
                            },
                            {
                                value: SortByDirection.DESC,
                                label: 'Descending',
                            },
                        ]}
                        onChange={(direction: SortByDirection) => {
                            dispatch(
                                actions.setSortBy([
                                    {
                                        reference: field?.reference,
                                        direction,
                                    },
                                ]),
                            );
                        }}
                    />
                </Config.Group>
            )}
        </>
    );
};

const GroupByFieldAxisConfig = ({
    field,
    groupByOptions = [],
    actions,
    columns,
    error,
}: {
    columns: VizColumn[];
    field: undefined | { reference: string };
    groupByOptions?: VizPivotLayoutOptions[];
    actions: CartesianChartActionsType;
    error: VizConfigErrors['groupByFieldError'];
}) => {
    const dispatch = useVizDispatch();
    const groupByError = error?.references[0]
        ? `Column "${error.references[0]}" does not exist. Choose another`
        : undefined;
    return (
        <FieldReferenceSelect
            rightSection={
                // When the field is deleted, the error state prevents the clear button from showing
                groupByError && (
                    <ActionIcon
                        onClick={() =>
                            dispatch(actions.unsetGroupByReference())
                        }
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )
            }
            clearable
            data={groupByOptions.map((groupBy) => ({
                value: groupBy.reference,
                label: groupBy.reference,
            }))}
            value={field?.reference ?? null}
            placeholder="Select group by"
            error={groupByError}
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
                columns?.find((x) => x.reference === field?.reference)?.type ??
                DimensionType.STRING
            }
        />
    );
};

export const CartesianChartFieldConfiguration = ({
    columns,
    actions,
    selectedChartType,
}: {
    selectedChartType: ChartKind;
    columns: VizColumn[];

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

    const errors = useVizSelector((state) =>
        cartesianChartSelectors.getErrors(state, selectedChartType),
    );

    return (
        <Stack spacing="sm">
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis`}</Config.Heading>
                    {xLayoutOptions && (
                        <XFieldAxisConfig
                            columns={columns}
                            field={xAxisField}
                            xLayoutOptions={xLayoutOptions}
                            actions={actions}
                            error={errors?.indexFieldError}
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
                                columns={columns}
                                error={errors?.valuesFieldError?.references.find(
                                    (reference) =>
                                        reference === field.reference,
                                )}
                            />
                        ))}
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>Group by</Config.Heading>
                    <GroupByFieldAxisConfig
                        columns={columns}
                        field={groupByField}
                        groupByOptions={groupByLayoutOptions}
                        actions={actions}
                        error={errors?.groupByFieldError}
                    />
                </Config.Section>
            </Config>
        </Stack>
    );
};
