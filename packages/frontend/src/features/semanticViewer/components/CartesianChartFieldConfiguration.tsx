import {
    DimensionType,
    type IndexLayoutOptions,
    type PivotLayoutOptions,
    type SqlCartesianChartLayout,
    type ValuesLayoutOptions,
} from '@lightdash/common';
import { ActionIcon, Box, Group, UnstyledButton } from '@mantine/core';
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
import { type CartesianChartActionsType } from '../store';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { cartesianChartSelectors } from '../store/selectors';
import { CartesianChartAggregationConfig } from './CartesianChartAggregationConfig';
import { FieldReferenceSelect } from './FieldReferenceSelect';

const YFieldsAxisConfig: FC<{
    field: SqlCartesianChartLayout['y'][number];
    yLayoutOptions: ValuesLayoutOptions[];
    isSingle: boolean;
    index: number;
    actions: CartesianChartActionsType;
}> = ({ field, yLayoutOptions, isSingle, index, actions }) => {
    const { hovered, ref } = useHover();
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.semanticViewer.columns);
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

                            <CartesianChartAggregationConfig
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
}: {
    field: SqlCartesianChartLayout['x'];
    xLayoutOptions: IndexLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.semanticViewer.columns);

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
}: {
    field: undefined | { reference: string };
    groupByOptions?: PivotLayoutOptions[];
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useAppDispatch();
    const sqlColumns = useAppSelector((state) => state.semanticViewer.columns);
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
    actions,
}: {
    actions: CartesianChartActionsType;
}) => {
    const dispatch = useAppDispatch();
    const xLayoutOptions = useAppSelector(
        cartesianChartSelectors.getIndexLayoutOptions,
    );
    const yLayoutOptions = useAppSelector(
        cartesianChartSelectors.getValuesLayoutOptions,
    );
    const xAxisField = useAppSelector(cartesianChartSelectors.getXAxisField);
    const yAxisFields = useAppSelector(cartesianChartSelectors.getYAxisFields);
    const groupByField = useAppSelector(
        cartesianChartSelectors.getGroupByField,
    );
    const groupByLayoutOptions = useAppSelector(
        cartesianChartSelectors.getPivotLayoutOptions,
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
                        actions={actions}
                    />
                </Config.Section>
            </Config>
        </>
    );
};
