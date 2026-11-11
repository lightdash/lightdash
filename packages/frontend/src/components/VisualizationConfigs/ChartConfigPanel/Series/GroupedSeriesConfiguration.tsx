import {
    CartesianSeriesType,
    formatItemValue,
    getItemId,
    getItemLabelWithoutTableName,
    getSeriesId,
    isSeriesWithMixedChartTypes,
    type CartesianChartLayout,
    type CustomDimension,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Checkbox, Group, Stack, Select, Switch } from '@mantine/core';
import React, { useCallback, type FC } from 'react';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import {
    SortableItem,
    SortableList,
    type SortableHandleProps,
} from '../../../common/Sortable/Sortable';
import { useVisualizationInputs } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { GrabIcon } from '../../common/GrabIcon';
import { ChartTypeSelect } from './ChartTypeSelect';
import seriesClasses from './Series.module.css';
import {
    SeriesDepthControl,
    type SeriesDrawOrderControl,
} from './SeriesDrawOrder';
import drawOrderStyles from './seriesDrawOrder.module.css';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

const VALUE_LABELS_OPTIONS = [
    { value: 'hidden', label: 'Hidden' },
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'inside', label: 'Inside' },
];

const AXIS_OPTIONS = [
    { value: '0', label: 'Left' },
    { value: '1', label: 'Right' },
];

const FLIPPED_AXIS_OPTIONS = [
    { value: '0', label: 'Bottom' },
    { value: '1', label: 'Top' },
];

const getFormatterValue = (
    value: any,
    key: string,
    items: Array<Field | TableCalculation | CustomDimension>,
    timezone?: string,
) => {
    const item = items.find((i) => getItemId(i) === key);
    return formatItemValue(item, value, true, undefined, timezone);
};

type GroupedSeriesConfigurationProps = {
    layout?: CartesianChartLayout;
    seriesGroup: Series[];
    item: Field | TableCalculation | CustomDimension;
    items: Array<Field | TableCalculation | CustomDimension>;
    dragHandleProps?: SortableHandleProps | null;
    isDragDisabled?: boolean;
    drawOrder?: SeriesDrawOrderControl;
    updateAllGroupedSeries: (fieldKey: string, series: Partial<Series>) => void;
    series: Series[];
} & Pick<
    ReturnType<typeof useCartesianChartConfig>,
    'updateSingleSeries' | 'getSingleSeries' | 'updateSeries'
>;

const GroupedSeriesConfiguration: FC<GroupedSeriesConfigurationProps> = ({
    layout,
    seriesGroup,
    item,
    items,
    getSingleSeries,
    updateSingleSeries,
    updateAllGroupedSeries,
    dragHandleProps,
    isDragDisabled,
    drawOrder,
    updateSeries,
    series,
}) => {
    const { resolvedTimezone } = useVisualizationInputs();

    const [openSeriesId, setOpenSeriesId] = React.useState<
        string | undefined
    >();

    const isLabelTheSameForAllSeries: boolean =
        new Set(seriesGroup.map(({ label }) => label?.position)).size === 1;

    const isAxisTheSameForAllSeries: boolean =
        new Set(seriesGroup.map(({ yAxisIndex }) => yAxisIndex)).size === 1;

    const isChartTypeTheSameForAllSeries: boolean =
        !isSeriesWithMixedChartTypes(seriesGroup);

    const chartType =
        seriesGroup[0].type === CartesianSeriesType.LINE &&
        !!seriesGroup[0].areaStyle
            ? CartesianSeriesType.AREA
            : seriesGroup[0].type;

    const chartValue = isChartTypeTheSameForAllSeries ? chartType : 'mixed';
    const fieldKey = getItemId(item);

    // The chart draws a stack's total when any series in the stack asks for
    // it (see getStackTotalSeries), so the switch must read the same way
    // rather than looking only at the first series.
    const isStackTotalShown = seriesGroup.some(
        ({ stackLabel }) => stackLabel?.show,
    );

    const seriesGroupIds = seriesGroup.map(getSeriesId);

    const onReorder = useCallback(
        (from: number, to: number) => {
            const draggableId = getSeriesId(seriesGroup[from]);
            const allSerieIds = series.map(getSeriesId);
            const serie = series.find((s) => getSeriesId(s) === draggableId);
            if (!serie) return;

            const previousGroupedItem =
                to < seriesGroup.length ? seriesGroup[to] : undefined;
            const destinationIndex =
                previousGroupedItem !== undefined
                    ? allSerieIds.indexOf(getSeriesId(previousGroupedItem))
                    : 0;

            const sortedSeries = series.filter(
                (s) => getSeriesId(s) !== draggableId,
            );
            sortedSeries.splice(destinationIndex, 0, serie);

            updateSeries(sortedSeries);
        },
        [series, seriesGroup, updateSeries],
    );

    return (
        <Config>
            <Config.Section>
                <Group
                    wrap="nowrap"
                    gap="two"
                    className={drawOrderStyles.seriesHeader}
                >
                    <GrabIcon
                        dragHandleProps={dragHandleProps}
                        disabled={isDragDisabled}
                        disabledTooltip="Series order is automatically determined by the sort applied to the grouped dimension"
                    />

                    <Config.Heading>
                        {getItemLabelWithoutTableName(item)} (grouped)
                    </Config.Heading>
                    {drawOrder && <SeriesDepthControl control={drawOrder} />}
                </Group>
                <Stack gap="xs" ml="md">
                    <Group wrap="nowrap" gap="xs" align="start">
                        <ChartTypeSelect
                            chartValue={chartValue}
                            showMixed={!isChartTypeTheSameForAllSeries}
                            onChange={(value) => {
                                const newType =
                                    value === CartesianSeriesType.AREA
                                        ? CartesianSeriesType.LINE
                                        : value;
                                updateAllGroupedSeries(fieldKey, {
                                    type: newType as Series['type'],
                                    areaStyle:
                                        value === CartesianSeriesType.AREA
                                            ? {}
                                            : undefined,
                                });
                            }}
                        />

                        <Select
                            allowDeselect={false}
                            label="Axis"
                            value={
                                isAxisTheSameForAllSeries
                                    ? String(seriesGroup[0].yAxisIndex)
                                    : 'mixed'
                            }
                            data={
                                isAxisTheSameForAllSeries
                                    ? layout?.flipAxes
                                        ? FLIPPED_AXIS_OPTIONS
                                        : AXIS_OPTIONS
                                    : [
                                          ...(layout?.flipAxes
                                              ? FLIPPED_AXIS_OPTIONS
                                              : AXIS_OPTIONS),
                                          {
                                              value: 'mixed',
                                              label: 'Mixed',
                                          },
                                      ]
                            }
                            onChange={(value) => {
                                updateAllGroupedSeries(fieldKey, {
                                    yAxisIndex: parseInt(value || '0', 10),
                                });
                            }}
                        />
                        <Select
                            allowDeselect={false}
                            label="Value labels"
                            value={
                                isLabelTheSameForAllSeries
                                    ? seriesGroup[0].label?.position || 'hidden'
                                    : 'mixed'
                            }
                            data={
                                isLabelTheSameForAllSeries
                                    ? VALUE_LABELS_OPTIONS
                                    : [
                                          ...VALUE_LABELS_OPTIONS,
                                          {
                                              value: 'mixed',
                                              label: 'Mixed',
                                          },
                                      ]
                            }
                            onChange={(value) => {
                                updateAllGroupedSeries(fieldKey, {
                                    label:
                                        value === 'hidden'
                                            ? { show: false }
                                            : {
                                                  show: true,
                                                  position: value as any,
                                                  showOverlappingLabels:
                                                      seriesGroup[0].label
                                                          ?.showOverlappingLabels ??
                                                      false,
                                              },
                                });
                            }}
                        />
                        {seriesGroup[0].stack &&
                            chartValue === CartesianSeriesType.BAR && (
                                <Stack gap="xs" mt="two">
                                    <Config.Label>Total</Config.Label>
                                    <Switch
                                        size="xs"
                                        checked={isStackTotalShown}
                                        onChange={() => {
                                            updateAllGroupedSeries(fieldKey, {
                                                stackLabel: {
                                                    show: !isStackTotalShown,
                                                },
                                            });
                                        }}
                                    />
                                </Stack>
                            )}
                    </Group>
                    {(chartValue === CartesianSeriesType.LINE ||
                        chartValue === CartesianSeriesType.AREA) && (
                        <Group gap="xs">
                            <Checkbox
                                size="xs"
                                checked={Boolean(seriesGroup[0].showSymbol)}
                                label="Show symbol"
                                onChange={() => {
                                    updateAllGroupedSeries(fieldKey, {
                                        showSymbol: !Boolean(
                                            seriesGroup[0].showSymbol,
                                        ),
                                    });
                                }}
                            />
                            <Checkbox
                                size="xs"
                                checked={seriesGroup[0].smooth}
                                label="Smooth"
                                onChange={() => {
                                    updateAllGroupedSeries(fieldKey, {
                                        smooth: !(
                                            seriesGroup[0].smooth ?? true
                                        ),
                                    });
                                }}
                            />
                        </Group>
                    )}
                </Stack>
                <Box ml="md" className={seriesClasses.seriesList}>
                    <SortableList items={seriesGroupIds} onReorder={onReorder}>
                        <div>
                            {seriesGroup.map((singleSeries) => {
                                const pivotLabel =
                                    singleSeries.encode.yRef.pivotValues!.reduce(
                                        (acc, { field, value }) => {
                                            const formattedValue =
                                                getFormatterValue(
                                                    value,
                                                    field,
                                                    items,
                                                    resolvedTimezone,
                                                );
                                            return acc
                                                ? `${acc} - ${formattedValue}`
                                                : formattedValue;
                                        },
                                        '',
                                    );
                                const seriesId = getSeriesId(singleSeries);
                                return (
                                    <SortableItem
                                        key={seriesId}
                                        id={seriesId}
                                        disabled={isDragDisabled}
                                    >
                                        {(sortable) => (
                                            <Box
                                                ref={sortable.ref}
                                                className={sortable.className}
                                                // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                                                style={sortable.style}
                                                mb="xxs"
                                            >
                                                <SingleSeriesConfiguration
                                                    dragHandleProps={
                                                        sortable.handleProps
                                                    }
                                                    isDragDisabled={
                                                        isDragDisabled
                                                    }
                                                    isCollapsable
                                                    layout={layout}
                                                    series={singleSeries}
                                                    seriesLabel={
                                                        layout?.yField &&
                                                        layout.yField.length > 1
                                                            ? `[${pivotLabel}] ${getItemLabelWithoutTableName(
                                                                  item,
                                                              )}`
                                                            : pivotLabel
                                                    }
                                                    updateSingleSeries={
                                                        updateSingleSeries
                                                    }
                                                    getSingleSeries={
                                                        getSingleSeries
                                                    }
                                                    isGrouped
                                                    isOpen={
                                                        openSeriesId ===
                                                        seriesId
                                                    }
                                                    toggleIsOpen={() =>
                                                        setOpenSeriesId(
                                                            openSeriesId ===
                                                                seriesId
                                                                ? undefined
                                                                : seriesId,
                                                        )
                                                    }
                                                />
                                            </Box>
                                        )}
                                    </SortableItem>
                                );
                            })}
                        </div>
                    </SortableList>
                </Box>
            </Config.Section>
        </Config>
    );
};
export default GroupedSeriesConfiguration;
