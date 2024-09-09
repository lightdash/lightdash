import {
    DimensionType,
    type ChartKind,
    type VizChartLayout,
    type VizColumn,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { ActionIcon, Box } from '@mantine/core';
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
}> = ({ field, yLayoutOptions, isSingle, index, actions, columns }) => {
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
                                yLayoutOptions.find(
                                    (y) => y.reference === field.reference,
                                ) === undefined &&
                                `Column "${field.reference}" does not exist. Choose another`
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
}: {
    columns: VizColumn[];

    field: VizChartLayout['x'] | undefined;
    xLayoutOptions: VizIndexLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();

    return (
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
                field?.reference &&
                xLayoutOptions.find((x) => x.reference === field.reference) ===
                    undefined &&
                `Column "${field.reference}" does not exist. Choose another`
            }
            fieldType={
                (field?.reference &&
                    columns?.find((x) => x.reference === field.reference)
                        ?.type) ||
                DimensionType.STRING
            }
        />
    );
};

const GroupByFieldAxisConfig = ({
    field,
    groupByOptions = [],
    actions,
    columns,
}: {
    columns: VizColumn[];
    field: undefined | { reference: string };
    groupByOptions?: VizPivotLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();
    const error =
        field !== undefined &&
        !groupByOptions.find((x) => x.reference === field.reference)
            ? `Column "${field.reference}" does not exist. Choose another`
            : undefined;
    return (
        <FieldReferenceSelect
            rightSection={
                // When the field is deleted, the error state prevents the clear button from showing
                error && (
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
            error={error}
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

    return (
        <>
            <Config>
                <Config.Section>
                    <Config.Heading>{`X-axis`}</Config.Heading>
                    {xLayoutOptions && (
                        <XFieldAxisConfig
                            columns={columns}
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
                                columns={columns}
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
                    />
                </Config.Section>
            </Config>
        </>
    );
};
