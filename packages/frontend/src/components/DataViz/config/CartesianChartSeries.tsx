import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    CartesianChartDataModel,
    ECHARTS_DEFAULT_COLORS,
    friendlyName,
    StackType,
    type AxisSide,
    type CartesianChartDisplay,
    type ChartKind,
    type PivotChartLayout,
    type ValueLabelPositionOptions,
} from '@lightdash/common';
import {
    Accordion,
    Group,
    SegmentedControl,
    Stack,
    Text,
    useMantineColorScheme,
} from '@mantine/core';
import { useCallback, useMemo } from 'react';
import {
    useAppSelector,
    useAppDispatch as useVizDispatch,
} from '../../../features/sqlRunner/store/hooks';
import { selectProjectUuid } from '../../../features/sqlRunner/store/sqlRunnerSlice';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import {
    SeriesDepthControl,
    type SeriesDrawOrderControl,
} from '../../VisualizationConfigs/ChartConfigPanel/Series/SeriesDrawOrder';
import drawOrderStyles from '../../VisualizationConfigs/ChartConfigPanel/Series/seriesDrawOrder.module.css';
import { Config } from '../../VisualizationConfigs/common/Config';
import { GrabIcon } from '../../VisualizationConfigs/common/GrabIcon';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { selectCurrentCartesianChartState } from '../store/selectors';
import classes from './CartesianChartSeries.module.css';
import { SeriesOrderList } from './SeriesOrderList';
import { SingleSeriesConfiguration } from './SingleSeriesConfiguration';

type ConfigurableSeries = {
    reference: PivotChartLayout['y'][number]['reference'];
} & Pick<
    NonNullable<CartesianChartDisplay['series']>[number],
    'format' | 'label' | 'color' | 'type' | 'valueLabelPosition' | 'whichYAxis'
>;

export const CartesianChartSeries = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
}) => {
    const projectUuid = useAppSelector(selectProjectUuid);
    const { data: resolvedPalette } = useProjectColorPalette(
        projectUuid || undefined,
    );
    const { colorScheme } = useMantineColorScheme();
    const colors =
        colorScheme === 'dark' && resolvedPalette?.darkColors?.length
            ? resolvedPalette.darkColors
            : (resolvedPalette?.colors ?? ECHARTS_DEFAULT_COLORS);
    const dispatch = useVizDispatch();

    const currentConfig = useAppSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const groupedSeries: Record<string, ConfigurableSeries[]> = useMemo(() => {
        if (!currentConfig?.series) {
            return {};
        }

        const originalIndices = new Map(
            currentConfig.series.map((series, index) => [series, index]),
        );
        return CartesianChartDataModel.getOrderedSeries(
            currentConfig.series,
            currentConfig.display?.seriesOrder,
        ).reduce<Record<string, ConfigurableSeries[]>>((acc, s) => {
            const foundSeries =
                currentConfig?.display?.series?.[s.pivotColumnName] ??
                currentConfig?.display?.series?.[s.referenceField];

            const seriesFormat = foundSeries?.format;
            const seriesLabel = foundSeries?.label;
            const seriesColor = foundSeries?.color;
            const seriesType = foundSeries?.type;
            const seriesValueLabelPosition = foundSeries?.valueLabelPosition;
            const seriesWhichYAxis = foundSeries?.whichYAxis;

            const config = {
                reference: s.pivotColumnName,
                format: seriesFormat,
                label: seriesLabel ?? friendlyName(s.pivotColumnName),
                color:
                    seriesColor ??
                    CartesianChartDataModel.getDefaultColor(
                        originalIndices.get(s) ?? 0,
                        colors,
                    ),
                type: seriesType,
                valueLabelPosition: seriesValueLabelPosition,
                whichYAxis: seriesWhichYAxis,
            };

            // Grouped by referenceField
            return {
                ...acc,
                [s.referenceField]: [...(acc[s.referenceField] || []), config],
            };
        }, {});
    }, [
        colors,
        currentConfig?.display?.series,
        currentConfig?.display?.seriesOrder,
        currentConfig?.series,
    ]);

    const seriesGroups = useMemo(() => {
        const orderedSeries = CartesianChartDataModel.getOrderedSeries(
            currentConfig?.series ?? [],
            currentConfig?.display?.seriesOrder,
        );
        return [...new Set(orderedSeries.map((s) => s.referenceField))].map(
            (reference) => ({ reference, series: groupedSeries[reference] }),
        );
    }, [
        currentConfig?.series,
        currentConfig?.display?.seriesOrder,
        groupedSeries,
    ]);
    const setGroupOrder = useCallback(
        (order: string[]) =>
            dispatch(
                actions.setSeriesOrder(
                    order.flatMap((reference) =>
                        groupedSeries[reference].map((s) => s.reference),
                    ),
                ),
            ),
        [dispatch, actions, groupedSeries],
    );
    const setGroupSeriesOrder = useCallback(
        (reference: string, order: string[]) =>
            dispatch(
                actions.setSeriesOrder(
                    seriesGroups.flatMap((group) =>
                        group.reference === reference
                            ? order
                            : group.series.map((s) => s.reference),
                    ),
                ),
            ),
        [dispatch, actions, seriesGroups],
    );

    // If any of the series in the groupedSeries have more than one value, then we can stack
    const canStack = useMemo(() => {
        return Object.keys(groupedSeries).some(
            (key) => Object.values(groupedSeries[key]).length > 1,
        );
    }, [groupedSeries]);

    const isGrouped = useMemo(() => {
        return (
            currentConfig?.fieldConfig?.groupBy !== undefined &&
            currentConfig?.fieldConfig?.groupBy.length > 0
        );
    }, [currentConfig?.fieldConfig?.groupBy]);

    const onColorChange = useCallback(
        (reference: string, color: string) => {
            dispatch(
                actions.setSeriesColor({
                    reference: reference,
                    color,
                }),
            );
        },
        [dispatch, actions],
    );

    const handleLabelChange = useCallback(
        (reference: string, label: string) => {
            dispatch(
                actions.setSeriesLabel({
                    label,
                    reference,
                }),
            );
        },
        [dispatch, actions],
    );

    const handleTypeChange = useCallback(
        (
            reference: string,
            type: NonNullable<CartesianChartDisplay['series']>[number]['type'],
        ) => {
            dispatch(
                actions.setSeriesChartType({
                    type,
                    reference,
                }),
            );
        },
        [dispatch, actions],
    );

    const handleAxisChange = useCallback(
        (reference: string, value: AxisSide) => {
            dispatch(
                actions.setSeriesYAxis({
                    whichYAxis: value,
                    reference,
                }),
            );
        },
        [dispatch, actions],
    );

    const handleValueLabelPositionChange = useCallback(
        (reference: string, position: ValueLabelPositionOptions) => {
            dispatch(
                actions.setSeriesValueLabelPosition({
                    valueLabelPosition: position,
                    reference,
                }),
            );
        },
        [dispatch, actions],
    );

    const renderSeries = useCallback(
        (
            series: ConfigurableSeries,
            dragHandleProps?: DraggableProvidedDragHandleProps | null,
            drawOrder?: SeriesDrawOrderControl,
        ) => (
            <SingleSeriesConfiguration
                key={series.reference}
                {...series}
                color={series.color}
                type={series.type}
                valueLabelPosition={series.valueLabelPosition}
                colors={colors}
                selectedChartType={selectedChartType}
                onColorChange={onColorChange}
                onLabelChange={handleLabelChange}
                onTypeChange={handleTypeChange}
                onAxisChange={handleAxisChange}
                onValueLabelPositionChange={handleValueLabelPositionChange}
                dragHandleProps={dragHandleProps}
                drawOrder={drawOrder}
            />
        ),
        [
            colors,
            selectedChartType,
            onColorChange,
            handleLabelChange,
            handleTypeChange,
            handleAxisChange,
            handleValueLabelPositionChange,
        ],
    );

    return (
        <Stack mt="sm" gap="xs">
            {Object.keys(groupedSeries).length === 0 && (
                <Text>No series found. Add a metric to create a series.</Text>
            )}
            {Object.keys(groupedSeries).length > 0 && (
                <>
                    <Config>
                        <Config.Group>
                            <Config.Label>{`Stacking`}</Config.Label>
                            <SegmentedControl
                                fz="sm"
                                disabled={!canStack}
                                data={[
                                    {
                                        value: 'None',
                                        label: 'None',
                                    },
                                    {
                                        value: 'Stacked',
                                        label: 'Stacked',
                                    },
                                    {
                                        value: '100%',
                                        label: '100%',
                                    },
                                ]}
                                value={(() => {
                                    const stackValue =
                                        currentConfig?.display?.stack;
                                    if (stackValue === StackType.PERCENT) {
                                        return '100%';
                                    }
                                    if (
                                        stackValue === StackType.NORMAL ||
                                        stackValue === true
                                    ) {
                                        return 'Stacked';
                                    }
                                    return 'None';
                                })()}
                                onChange={(value) =>
                                    dispatch(
                                        actions.setStacked(
                                            value === 'Stacked'
                                                ? StackType.NORMAL
                                                : value === '100%'
                                                  ? StackType.PERCENT
                                                  : StackType.NONE,
                                        ),
                                    )
                                }
                            />
                        </Config.Group>
                    </Config>
                </>
            )}
            <SeriesOrderList
                order={seriesGroups.map((group) => group.reference)}
                onChange={setGroupOrder}
            >
                {(reference, dragHandleProps, drawOrder) =>
                    isGrouped ? (
                        <Accordion
                            variant="contained"
                            className={classes.accordion}
                        >
                            <Accordion.Item value={reference} m={0}>
                                <Group
                                    gap="xs"
                                    wrap="nowrap"
                                    className={drawOrderStyles.seriesHeader}
                                >
                                    {dragHandleProps && (
                                        <GrabIcon
                                            dragHandleProps={dragHandleProps}
                                        />
                                    )}
                                    <Accordion.Control
                                        className={classes.controlPanel}
                                    >
                                        <Config.Subheading>
                                            {friendlyName(reference)}
                                        </Config.Subheading>
                                    </Accordion.Control>
                                    {drawOrder && (
                                        <SeriesDepthControl
                                            control={drawOrder}
                                        />
                                    )}
                                </Group>
                                <Accordion.Panel className={classes.panel}>
                                    <SeriesOrderList
                                        order={groupedSeries[reference].map(
                                            (series) => series.reference,
                                        )}
                                        onChange={(order) =>
                                            setGroupSeriesOrder(
                                                reference,
                                                order,
                                            )
                                        }
                                    >
                                        {(
                                            seriesReference,
                                            seriesDragHandleProps,
                                            seriesDrawOrder,
                                        ) => {
                                            const series = groupedSeries[
                                                reference
                                            ].find(
                                                (s) =>
                                                    s.reference ===
                                                    seriesReference,
                                            );
                                            return (
                                                series &&
                                                renderSeries(
                                                    series,
                                                    seriesDragHandleProps,
                                                    seriesDrawOrder,
                                                )
                                            );
                                        }}
                                    </SeriesOrderList>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>
                    ) : (
                        groupedSeries[reference].map((series) =>
                            renderSeries(series, dragHandleProps, drawOrder),
                        )
                    )
                }
            </SeriesOrderList>
        </Stack>
    );
};
