import {
    CartesianSeriesType,
    formatItemValue,
    getItemId,
    getItemLabelWithoutTableName,
    getSeriesId,
    isCustomDimension,
    isSeriesWithMixedChartTypes,
    type CartesianChartLayout,
    type CustomDimension,
    type Field,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import React, { useCallback, type FC } from 'react';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

import {
    DragDropContext,
    Draggable,
    Droppable,
    type DraggableProvidedDragHandleProps,
    type DraggableStateSnapshot,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    Box,
    Checkbox,
    Group,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../../common/MantineIcon';
import { ConfigGroup } from '../common/ConfigGroup';
import { ChartTypeSelect } from './ChartTypeSelect';

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
) => {
    const item = items.find((i) => getItemId(i) === key);
    if (isCustomDimension(item)) return value;

    return formatItemValue(item, value);
};

type DraggablePortalHandlerProps = {
    snapshot: DraggableStateSnapshot;
};

const DraggablePortalHandler: FC<
    React.PropsWithChildren<DraggablePortalHandlerProps>
> = ({ children, snapshot }) => {
    if (snapshot.isDragging) return createPortal(children, document.body);
    return <>{children}</>;
};

type GroupedSeriesConfigurationProps = {
    layout?: CartesianChartLayout;
    seriesGroup: Series[];
    item: Field | TableCalculation | CustomDimension;
    items: Array<Field | TableCalculation | CustomDimension>;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    updateAllGroupedSeries: (fieldKey: string, series: Partial<Series>) => void;
    updateSingleSeries: (series: Series) => void;
    updateSeries: (series: Series[]) => void;
    series: Series[];
};

const GroupedSeriesConfiguration: FC<GroupedSeriesConfigurationProps> = ({
    layout,
    seriesGroup,
    item,
    items,
    updateSingleSeries,
    updateAllGroupedSeries,
    dragHandleProps,
    updateSeries,
    series,
}) => {
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

    const onDragEnd = useCallback(
        (result: DropResult) => {
            const allSerieIds = series.map(getSeriesId);
            const serie = series.find(
                (s) => getSeriesId(s) === result.draggableId,
            );
            if (!serie) return;
            if (!result.destination) return;
            if (result.destination.index === result.source.index) return;

            const previousGroupedItem =
                result.destination.index < seriesGroup.length
                    ? seriesGroup[result.destination.index]
                    : undefined;
            const destinationIndex =
                previousGroupedItem !== undefined
                    ? allSerieIds.indexOf(getSeriesId(previousGroupedItem))
                    : 0;

            const sortedSeries = series.filter(
                (s) => getSeriesId(s) !== result.draggableId,
            );
            sortedSeries.splice(destinationIndex, 0, serie);

            updateSeries(sortedSeries);
        },
        [series, seriesGroup, updateSeries],
    );

    return (
        <ConfigGroup>
            <Group noWrap spacing="two">
                <Box
                    {...dragHandleProps}
                    sx={{
                        opacity: 0.6,
                        cursor: 'grab',
                        '&:hover': { opacity: 1 },
                    }}
                >
                    <MantineIcon icon={IconGripVertical} />
                </Box>
                <ConfigGroup.Label>
                    {getItemLabelWithoutTableName(item)} (grouped)
                </ConfigGroup.Label>
            </Group>
            <Group noWrap spacing="xs" align="start">
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
                    label={<ConfigGroup.SubLabel>Axis</ConfigGroup.SubLabel>}
                    size="xs"
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
                    label={
                        <ConfigGroup.SubLabel>
                            Value labels
                        </ConfigGroup.SubLabel>
                    }
                    size="xs"
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
                                      },
                        });
                    }}
                />
                {seriesGroup[0].stack &&
                    chartValue === CartesianSeriesType.BAR && (
                        <Stack spacing="xs" mt="two">
                            <Text size="xs" fw={500}>
                                Total
                            </Text>
                            <Switch
                                size="xs"
                                checked={seriesGroup[0].stackLabel?.show}
                                onChange={() => {
                                    updateAllGroupedSeries(fieldKey, {
                                        stackLabel: {
                                            show: !seriesGroup[0].stackLabel
                                                ?.show,
                                        },
                                    });
                                }}
                            />
                        </Stack>
                    )}
            </Group>
            {(chartValue === CartesianSeriesType.LINE ||
                chartValue === CartesianSeriesType.AREA) && (
                <Group spacing="xs">
                    <Checkbox
                        size="xs"
                        checked={seriesGroup[0].showSymbol ?? true}
                        label={
                            <ConfigGroup.SubLabel>
                                Show symbol
                            </ConfigGroup.SubLabel>
                        }
                        onChange={() => {
                            updateAllGroupedSeries(fieldKey, {
                                showSymbol: !(
                                    seriesGroup[0].showSymbol ?? true
                                ),
                            });
                        }}
                        sx={{
                            label: {
                                paddingLeft: 4,
                            },
                        }}
                    />
                    <Checkbox
                        size="xs"
                        checked={seriesGroup[0].smooth}
                        label={
                            <ConfigGroup.SubLabel>Smooth</ConfigGroup.SubLabel>
                        }
                        onChange={() => {
                            updateAllGroupedSeries(fieldKey, {
                                smooth: !(seriesGroup[0].smooth ?? true),
                            });
                        }}
                        sx={{
                            label: {
                                paddingLeft: 4,
                            },
                        }}
                    />
                </Group>
            )}
            <Box
                bg="gray.1"
                p="xxs"
                sx={(theme) => ({ borderRadius: theme.radius.sm })}
            >
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="grouped-series-sort-fields">
                        {(dropProps) => (
                            <div
                                {...dropProps.droppableProps}
                                ref={dropProps.innerRef}
                            >
                                {seriesGroup?.map((singleSeries, i) => {
                                    const pivotLabel =
                                        singleSeries.encode.yRef.pivotValues!.reduce(
                                            (acc, { field, value }) => {
                                                const formattedValue =
                                                    getFormatterValue(
                                                        value,
                                                        field,
                                                        items,
                                                    );
                                                return acc
                                                    ? `${acc} - ${formattedValue}`
                                                    : formattedValue;
                                            },
                                            '',
                                        );
                                    return (
                                        <Draggable
                                            key={getSeriesId(singleSeries)}
                                            draggableId={getSeriesId(
                                                singleSeries,
                                            )}
                                            index={i}
                                        >
                                            {(
                                                {
                                                    draggableProps,
                                                    dragHandleProps:
                                                        groupedDragHandleProps,
                                                    innerRef,
                                                },
                                                snapshot,
                                            ) => (
                                                <DraggablePortalHandler
                                                    snapshot={snapshot}
                                                >
                                                    <div
                                                        ref={innerRef}
                                                        {...draggableProps}
                                                    >
                                                        <Box
                                                            mb="xxs"
                                                            key={getSeriesId(
                                                                singleSeries,
                                                            )}
                                                        >
                                                            <SingleSeriesConfiguration
                                                                dragHandleProps={
                                                                    groupedDragHandleProps
                                                                }
                                                                isCollapsable
                                                                layout={layout}
                                                                series={
                                                                    singleSeries
                                                                }
                                                                seriesLabel={
                                                                    layout?.yField &&
                                                                    layout
                                                                        .yField
                                                                        .length >
                                                                        1
                                                                        ? `[${pivotLabel}] ${getItemLabelWithoutTableName(
                                                                              item,
                                                                          )}`
                                                                        : pivotLabel
                                                                }
                                                                updateSingleSeries={
                                                                    updateSingleSeries
                                                                }
                                                                isGrouped
                                                                isOpen={
                                                                    openSeriesId ===
                                                                    getSeriesId(
                                                                        singleSeries,
                                                                    )
                                                                }
                                                                toggleIsOpen={() =>
                                                                    setOpenSeriesId(
                                                                        openSeriesId ===
                                                                            getSeriesId(
                                                                                singleSeries,
                                                                            )
                                                                            ? undefined
                                                                            : getSeriesId(
                                                                                  singleSeries,
                                                                              ),
                                                                    )
                                                                }
                                                            />
                                                        </Box>
                                                    </div>
                                                </DraggablePortalHandler>
                                            )}
                                        </Draggable>
                                    );
                                })}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            </Box>
        </ConfigGroup>
    );
};
export default GroupedSeriesConfiguration;
