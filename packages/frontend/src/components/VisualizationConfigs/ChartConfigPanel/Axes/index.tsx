import {
    CartesianSeriesType,
    getAxisName,
    getDateGroupLabel,
    getItemLabelWithoutTableName,
    getXAxisSort,
    isNumericItem,
    XAxisSort,
    type ItemsMap,
} from '@lightdash/common';
import {
    Checkbox,
    Group,
    NumberInput,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconChartBar,
    IconMinus,
    IconSortAscending,
    IconSortDescending,
    IconSwitchHorizontal,
    type Icon,
} from '@tabler/icons-react';
import { forwardRef, type FC } from 'react';
import { getAxisTypeFromField } from '../../../../hooks/echarts/useEchartsCartesianConfig';
import MantineIcon from '../../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { AxisMinMax } from './AxisMinMax';

const XAxisSortSelectItem = forwardRef<
    HTMLDivElement,
    { icon: Icon; label: string; mirrorIcon: boolean }
>(({ icon, label, mirrorIcon, ...others }, ref) => (
    <Group ref={ref} spacing="xs" {...others} noWrap>
        <MantineIcon
            style={mirrorIcon ? { transform: 'rotateY(180deg)' } : undefined}
            icon={icon}
        />
        <Text fz="xs">{label}</Text>
    </Group>
));

type Props = {
    itemsMap: ItemsMap | undefined;
};

const DEFAULT_OFFSET_VALUE_FOR_MANUAL_RANGE_PERCENTAGE = '5';

export const Axes: FC<Props> = ({ itemsMap }) => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const {
        dirtyLayout,
        dirtyEchartsConfig,
        setXAxisName,
        setYAxisName,
        setYMinValue,
        setYMaxValue,
        setXMinValue,
        setXMinOffsetValue,
        setXMaxValue,
        setXMaxOffsetValue,
        setShowGridX,
        setShowGridY,
        setShowXAxis,
        setShowYAxis,
        setShowAxisTicks,
        setXAxisSort,
        setXAxisLabelRotation,
        setScrollableChart,
        dirtyChartType,
    } = visualizationConfig.chartConfig;

    const xAxisField =
        itemsMap && dirtyLayout?.xField
            ? itemsMap[dirtyLayout?.xField]
            : undefined;

    const selectedAxisInSeries = Array.from(
        new Set(
            dirtyEchartsConfig?.series?.map(({ yAxisIndex }) => yAxisIndex),
        ),
    );
    const isAxisTheSameForAllSeries: boolean =
        selectedAxisInSeries.length === 1;
    const selectedAxisIndex = selectedAxisInSeries[0] || 0;

    const [showFirstAxisRange, showSecondAxisRange] = (
        dirtyEchartsConfig?.series || []
    ).reduce<[boolean, boolean]>(
        (acc, series) => {
            if (!itemsMap) return acc;
            const seriesField = itemsMap[series.encode.yRef.field];
            if (isNumericItem(seriesField)) {
                acc[series.yAxisIndex || 0] = true;
            }
            return acc;
        },
        [false, false],
    );

    const canSortByBarTotals =
        dirtyChartType === CartesianSeriesType.BAR &&
        getAxisTypeFromField(xAxisField) === 'category';

    const showXAxis =
        dirtyLayout?.showXAxis !== undefined ? dirtyLayout?.showXAxis : true;
    const showYAxis =
        dirtyLayout?.showYAxis !== undefined ? dirtyLayout?.showYAxis : true;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>{`${
                        dirtyLayout?.flipAxes ? 'Y' : 'X'
                    }-axis label`}</Config.Heading>
                    <TextInput
                        placeholder="Enter axis label"
                        defaultValue={
                            dirtyEchartsConfig?.xAxis?.[0]?.name ||
                            (xAxisField &&
                                (getDateGroupLabel(xAxisField) ||
                                    getItemLabelWithoutTableName(xAxisField)))
                        }
                        onBlur={(e) => setXAxisName(e.currentTarget.value)}
                    />

                    {isNumericItem(xAxisField) && (
                        <AxisMinMax
                            label={`Auto ${
                                dirtyLayout?.flipAxes ? 'y' : 'x'
                            }-axis range`}
                            min={dirtyEchartsConfig?.xAxis?.[0]?.min}
                            max={dirtyEchartsConfig?.xAxis?.[0]?.max}
                            setMin={(newValue) => setXMinValue(0, newValue)}
                            setMax={(newValue) => setXMaxValue(0, newValue)}
                        />
                    )}

                    {isNumericItem(xAxisField) && !dirtyLayout?.flipAxes && (
                        <>
                            <Switch
                                label="Truncate x-axis"
                                checked={
                                    dirtyEchartsConfig?.xAxis?.[0]
                                        ?.minOffset !== undefined ||
                                    dirtyEchartsConfig?.xAxis?.[0]
                                        ?.maxOffset !== undefined
                                }
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setXMaxOffsetValue(
                                            0,
                                            DEFAULT_OFFSET_VALUE_FOR_MANUAL_RANGE_PERCENTAGE,
                                        );
                                        setXMinOffsetValue(
                                            0,
                                            DEFAULT_OFFSET_VALUE_FOR_MANUAL_RANGE_PERCENTAGE,
                                        );
                                    } else {
                                        setXMaxOffsetValue(0, undefined);
                                        setXMinOffsetValue(0, undefined);
                                    }
                                }}
                            />
                        </>
                    )}
                    <Group spacing="xs">
                        <Group spacing="xs">
                            <Config.Label>Sort</Config.Label>
                            <Select
                                value={getXAxisSort(
                                    dirtyEchartsConfig?.xAxis?.[0],
                                )}
                                onChange={setXAxisSort}
                                itemComponent={XAxisSortSelectItem}
                                data={[
                                    {
                                        value: XAxisSort.DEFAULT,
                                        label: 'Default',
                                        icon: IconMinus,
                                    },
                                    {
                                        value: XAxisSort.DEFAULT_REVERSED,
                                        label: 'Default (reversed)',
                                        icon: IconSwitchHorizontal,
                                    },
                                    {
                                        value: XAxisSort.ASCENDING,
                                        label: 'Ascending',
                                        icon: IconSortAscending,
                                    },
                                    {
                                        value: XAxisSort.DESCENDING,
                                        label: 'Descending',
                                        icon: IconSortDescending,
                                    },
                                    {
                                        value: XAxisSort.BAR_TOTALS_ASCENDING,
                                        label: 'Bars ascending',
                                        icon: IconChartBar,
                                        disabled: !canSortByBarTotals,
                                    },
                                    {
                                        value: XAxisSort.BAR_TOTALS_DESCENDING,
                                        label: 'Bars descending',
                                        icon: IconChartBar,
                                        mirrorIcon: true,
                                        disabled: !canSortByBarTotals,
                                    },
                                ]}
                            />
                        </Group>
                        {!dirtyLayout?.flipAxes && (
                            <Group noWrap spacing="xs" align="baseline">
                                <Config.Label>Rotation</Config.Label>
                                <NumberInput
                                    type="number"
                                    defaultValue={
                                        dirtyEchartsConfig?.xAxis?.[0].rotate ||
                                        0
                                    }
                                    min={0}
                                    max={90}
                                    step={15}
                                    maw={54}
                                    rightSection="°"
                                    onChange={(value) => {
                                        setXAxisLabelRotation(Number(value));
                                    }}
                                />
                            </Group>
                        )}
                    </Group>

                    {getAxisTypeFromField(xAxisField) === 'category' && (
                        <Checkbox
                            label="Enable scrollable chart"
                            checked={
                                dirtyEchartsConfig?.xAxis?.[0]
                                    ?.enableDataZoom || false
                            }
                            onChange={(e) =>
                                setScrollableChart(e.currentTarget.checked)
                            }
                        />
                    )}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>{`${
                        dirtyLayout?.flipAxes ? 'X' : 'Y'
                    }-axis label (${
                        dirtyLayout?.flipAxes ? 'bottom' : 'left'
                    })`}</Config.Heading>

                    <TextInput
                        placeholder="Enter axis label"
                        defaultValue={
                            dirtyEchartsConfig?.yAxis?.[0]?.name ||
                            getAxisName({
                                isAxisTheSameForAllSeries,
                                selectedAxisIndex,
                                axisReference: 'yRef',
                                axisIndex: 0,
                                series: dirtyEchartsConfig?.series,
                                itemsMap,
                            })
                        }
                        onBlur={(e) => setYAxisName(0, e.currentTarget.value)}
                    />
                    {showFirstAxisRange && (
                        <AxisMinMax
                            label={`Auto ${
                                dirtyLayout?.flipAxes ? 'x' : 'y'
                            }-axis range`}
                            min={dirtyEchartsConfig?.yAxis?.[0]?.min}
                            max={dirtyEchartsConfig?.yAxis?.[0]?.max}
                            setMin={(newValue) => setYMinValue(0, newValue)}
                            setMax={(newValue) => setYMaxValue(0, newValue)}
                        />
                    )}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>{`${
                        dirtyLayout?.flipAxes ? 'X' : 'Y'
                    }-axis label (${
                        dirtyLayout?.flipAxes ? 'top' : 'right'
                    })`}</Config.Heading>

                    <TextInput
                        placeholder="Enter axis label"
                        defaultValue={
                            dirtyEchartsConfig?.yAxis?.[1]?.name ||
                            getAxisName({
                                isAxisTheSameForAllSeries,
                                selectedAxisIndex,
                                axisReference: 'yRef',
                                axisIndex: 1,
                                series: dirtyEchartsConfig?.series,
                                itemsMap,
                            })
                        }
                        onBlur={(e) => setYAxisName(1, e.currentTarget.value)}
                    />

                    {showSecondAxisRange && (
                        <AxisMinMax
                            label={`Auto ${
                                dirtyLayout?.flipAxes ? 'x' : 'y'
                            }-axis range`}
                            min={dirtyEchartsConfig?.yAxis?.[1]?.min}
                            max={dirtyEchartsConfig?.yAxis?.[1]?.max}
                            setMin={(newValue) => setYMinValue(1, newValue)}
                            setMax={(newValue) => setYMaxValue(1, newValue)}
                        />
                    )}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>Show grid</Config.Heading>

                    <Stack spacing="xs">
                        <Checkbox
                            label={`${dirtyLayout?.flipAxes ? 'Y' : 'X'}-axis`}
                            checked={!!dirtyLayout?.showGridX}
                            onChange={() => {
                                setShowGridX(!dirtyLayout?.showGridX);
                            }}
                        />

                        <Checkbox
                            label={`${dirtyLayout?.flipAxes ? 'X' : 'Y'}-axis`}
                            checked={
                                dirtyLayout?.showGridY !== undefined
                                    ? dirtyLayout?.showGridY
                                    : true
                            }
                            onChange={() => {
                                setShowGridY(
                                    dirtyLayout?.showGridY !== undefined
                                        ? !dirtyLayout?.showGridY
                                        : false,
                                );
                            }}
                        />
                    </Stack>
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>Show axis</Config.Heading>

                    <Stack spacing="xs">
                        <Checkbox
                            label={`${dirtyLayout?.flipAxes ? 'Y' : 'X'}-axis`}
                            checked={
                                dirtyLayout?.flipAxes ? showYAxis : showXAxis
                            }
                            onChange={() => {
                                if (dirtyLayout?.flipAxes) {
                                    setShowYAxis(!showYAxis);
                                } else {
                                    setShowXAxis(!showXAxis);
                                }
                            }}
                        />
                        <Checkbox
                            label={`${dirtyLayout?.flipAxes ? 'X' : 'Y'}-axis`}
                            checked={
                                dirtyLayout?.flipAxes ? showXAxis : showYAxis
                            }
                            onChange={() => {
                                if (dirtyLayout?.flipAxes) {
                                    setShowXAxis(!showXAxis);
                                } else {
                                    setShowYAxis(!showYAxis);
                                }
                            }}
                        />
                    </Stack>
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>Show tick lines</Config.Heading>
                    <Checkbox
                        label="Show tick lines on axes"
                        checked={!!dirtyEchartsConfig?.showAxisTicks}
                        onChange={(e) => {
                            setShowAxisTicks(e.currentTarget.checked);
                        }}
                    />
                </Config.Section>
            </Config>
        </Stack>
    );
};
