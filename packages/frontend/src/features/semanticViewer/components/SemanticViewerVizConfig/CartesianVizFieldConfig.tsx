import {
    DimensionType,
    type ChartKind,
    type SemanticLayerColumn,
    type VizChartLayout,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { ActionIcon, Box } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { FieldReferenceSelect } from '../../../../components/DataViz/FieldReferenceSelect';
import {
    useVizDispatch,
    useVizSelector,
    type CartesianChartActionsType,
} from '../../../../components/DataViz/store';
import { cartesianChartSelectors } from '../../../../components/DataViz/store/selectors';
import { AddButton } from '../../../../components/VisualizationConfigs/common/AddButton';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';

const YFieldsAxisConfig: FC<{
    field?: VizChartLayout['y'][number];
    yLayoutOptions: VizValuesLayoutOptions[];
    isSingle: boolean;
    index: number;
    actions: CartesianChartActionsType;
    columns: SemanticLayerColumn[];
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
                            disabled={yLayoutOptions.length < 1}
                            value={field?.reference ?? null}
                            placeholder={
                                yLayoutOptions.length < 1
                                    ? 'No fields available'
                                    : 'Select Y axis'
                            }
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
                                    (x) => x.reference === field?.reference,
                                )?.type ?? DimensionType.STRING
                            }
                        />
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
    columns: SemanticLayerColumn[];

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
    columns: SemanticLayerColumn[];
    field: undefined | { reference: string };
    groupByOptions?: VizPivotLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();
    const error =
        field !== undefined &&
        !groupByOptions.find((x) => x.reference === field.reference)
            ? `Column "${field.reference}" is no available. Choose another`
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
            disabled={!groupByOptions.length}
            clearable
            data={groupByOptions.map((groupBy) => ({
                value: groupBy.reference,
                label: groupBy.reference,
            }))}
            value={field?.reference ?? null}
            placeholder={
                groupByOptions.length
                    ? 'Select Group By'
                    : 'No fields available'
            }
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

export const CartesianVizFieldConfig = ({
    columns,
    actions,
    selectedChartType,
}: {
    selectedChartType: ChartKind;
    columns: SemanticLayerColumn[];

    actions: CartesianChartActionsType;
}) => {
    const dispatch = useVizDispatch();
    const xLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getIndexLayoutOptions(state, selectedChartType),
    );
    const yLayoutOptions = useVizSelector(
        (state) =>
            cartesianChartSelectors.getValuesLayoutOptions(
                state,
                selectedChartType,
            ) ?? [],
    );
    const xAxisField = useVizSelector((state) =>
        cartesianChartSelectors.getXAxisField(state, selectedChartType),
    );
    const yAxisFields = useVizSelector(
        (state) =>
            cartesianChartSelectors.getYAxisFields(state, selectedChartType) ??
            [],
    );
    const groupByField = useVizSelector((state) =>
        cartesianChartSelectors.getGroupByField(state, selectedChartType),
    );
    const groupByLayoutOptions = useVizSelector((state) =>
        cartesianChartSelectors.getPivotLayoutOptions(state, selectedChartType),
    );

    const availableGroupByFields = useMemo(() => {
        return groupByLayoutOptions?.filter(
            (groupBy) => xAxisField?.reference !== groupBy.reference,
        );
    }, [groupByLayoutOptions, xAxisField]);

    const areMoreYFieldsAvailable =
        (yLayoutOptions?.length || 0) > (yAxisFields?.length || 0);

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
                            disabled={!areMoreYFieldsAvailable}
                            onClick={() => dispatch(actions.addYAxisField())}
                        ></AddButton>
                    </Config.Group>
                    <YFieldsAxisConfig
                        key={yAxisFields[0]?.reference + 0}
                        field={yAxisFields[0]}
                        yLayoutOptions={yLayoutOptions}
                        isSingle={yAxisFields.length === 1}
                        index={0}
                        actions={actions}
                        columns={columns}
                    />
                    {yAxisFields.length > 1 &&
                        yAxisFields
                            .slice(1)
                            .map((field, index) => (
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
                        groupByOptions={availableGroupByFields}
                        actions={actions}
                    />
                </Config.Section>
            </Config>
        </>
    );
};
