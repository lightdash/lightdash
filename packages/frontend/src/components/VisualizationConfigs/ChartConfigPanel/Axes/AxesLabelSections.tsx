import {
    CartesianSeriesType,
    getAxisName,
    getDateGroupLabel,
    getDateGroupLabelWithGranularity,
    getGranularityMapFromItems,
    getItemLabelWithoutTableName,
    getXAxisSort,
    isNumericItem,
    XAxisSort,
    type ItemsMap,
} from '@lightdash/common';
import {
    Checkbox,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import {
    IconChartBar,
    IconMinus,
    IconSortAscending,
    IconSortDescending,
    IconSwitchHorizontal,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { getAxisTypeFromField } from '../../../../hooks/echarts/useEchartsCartesianConfig';
import MantineIcon from '../../../common/MantineIcon';
import { NumberInput } from '../../../common/NumberInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { LabelEditor } from '../../common/LabelEditor';
import { AxisMinInterval } from './AxisMinInterval';
import { AxisMinMax } from './AxisMinMax';

const XAxisSortSelectItem: FC<{
    icon: Icon;
    label: string;
    mirrorIcon?: boolean;
}> = ({ icon, label, mirrorIcon = false }) => (
    <Group gap="xs" wrap="nowrap">
        <MantineIcon
            style={mirrorIcon ? { transform: 'rotateY(180deg)' } : undefined}
            icon={icon}
        />
        <Text fz="xs">{label}</Text>
    </Group>
);

const DEFAULT_OFFSET_VALUE_FOR_MANUAL_RANGE_PERCENTAGE = '5';

type Props = {
    itemsMap: ItemsMap | undefined;
};

export const AxesLabelSections: FC<Props> = ({ itemsMap }) => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const granularityFields = Object.keys(getGranularityMapFromItems(itemsMap));

    const {
        dirtyLayout,
        dirtyEchartsConfig,
        setXAxisName,
        setYAxisName,
        setYMinValue,
        setYMaxValue,
        setYMinInterval,
        setXMinValue,
        setXMinInterval,
        setXMinOffsetValue,
        setXMaxValue,
        setXMaxOffsetValue,
        setXAxisSort,
        setXAxisLabelRotation,
        setScrollableChart,
        setXAxisTreatAsCategory,
        setDataZoomAnchor,
        setDataZoomItemCount,
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

    // A numeric x-axis can be rendered as discrete categories, so bars get band
    // spacing instead of overlapping the y-axis at the ends of the range.
    const canTreatXAxisAsCategory =
        isNumericItem(xAxisField) && !dirtyLayout?.flipAxes;
    const treatXAxisAsCategory =
        canTreatXAxisAsCategory &&
        !!dirtyEchartsConfig?.xAxis?.[0]?.treatAsCategory;
    const isXAxisCategory =
        getAxisTypeFromField(xAxisField) === 'category' || treatXAxisAsCategory;

    const canSortByBarTotals =
        dirtyChartType === CartesianSeriesType.BAR && isXAxisCategory;

    const xAxisSortOptions = [
        { value: XAxisSort.DEFAULT, label: 'Default', icon: IconMinus },
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
    ];

    return (
        <>
            <Config>
                <Config.Section>
                    <Config.Heading>{`${
                        dirtyLayout?.flipAxes ? 'Y' : 'X'
                    }-axis label`}</Config.Heading>
                    <LabelEditor
                        value={dirtyEchartsConfig?.xAxis?.[0]?.name ?? ''}
                        placeholder={
                            (xAxisField &&
                                (getDateGroupLabelWithGranularity(xAxisField) ||
                                    getDateGroupLabel(xAxisField) ||
                                    getItemLabelWithoutTableName(
                                        xAxisField,
                                    ))) ||
                            'Enter axis label'
                        }
                        fields={granularityFields}
                        onChange={(value) => setXAxisName(value)}
                    />

                    {canTreatXAxisAsCategory && (
                        <Switch
                            size="xs"
                            label="Treat as category"
                            description="Space values evenly instead of on a continuous scale"
                            checked={treatXAxisAsCategory}
                            onChange={(e) =>
                                setXAxisTreatAsCategory(e.currentTarget.checked)
                            }
                        />
                    )}

                    {isNumericItem(xAxisField) && !treatXAxisAsCategory && (
                        <AxisMinMax
                            label={`Auto ${dirtyLayout?.flipAxes ? 'y' : 'x'}-axis range`}
                            min={dirtyEchartsConfig?.xAxis?.[0]?.min}
                            max={dirtyEchartsConfig?.xAxis?.[0]?.max}
                            setMin={(newValue) => setXMinValue(0, newValue)}
                            setMax={(newValue) => setXMaxValue(0, newValue)}
                        />
                    )}

                    {isNumericItem(xAxisField) && !treatXAxisAsCategory && (
                        <AxisMinInterval
                            label="Min tick interval"
                            value={dirtyEchartsConfig?.xAxis?.[0]?.minInterval}
                            onChange={(newValue) =>
                                setXMinInterval(0, newValue)
                            }
                        />
                    )}

                    {canTreatXAxisAsCategory && !treatXAxisAsCategory && (
                        <>
                            <Switch
                                size="xs"
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
                    <Group gap="xs">
                        <Group gap="xs">
                            <Config.Label>Sort</Config.Label>
                            <Select
                                size="xs"
                                allowDeselect={false}
                                value={getXAxisSort(
                                    dirtyEchartsConfig?.xAxis?.[0],
                                )}
                                onChange={(value) =>
                                    value && setXAxisSort(value as XAxisSort)
                                }
                                renderOption={({ option }) => {
                                    const sortOption = xAxisSortOptions.find(
                                        ({ value }) => value === option.value,
                                    );
                                    return sortOption ? (
                                        <XAxisSortSelectItem {...sortOption} />
                                    ) : (
                                        option.label
                                    );
                                }}
                                data={xAxisSortOptions}
                            />
                        </Group>
                        {!dirtyLayout?.flipAxes && (
                            <Group wrap="nowrap" gap="xs" align="baseline">
                                <Config.Label>Rotation</Config.Label>
                                <NumberInput
                                    size="xs"
                                    defaultValue={
                                        dirtyEchartsConfig?.xAxis?.[0].rotate ||
                                        0
                                    }
                                    min={0}
                                    max={90}
                                    step={15}
                                    maw={54}
                                    rightSection="°"
                                    onNumberChange={(value) =>
                                        setXAxisLabelRotation(value ?? 0)
                                    }
                                />
                            </Group>
                        )}
                    </Group>

                    {isXAxisCategory && (
                        <Stack gap="xs">
                            <Checkbox
                                size="xs"
                                label="Enable scrollable chart"
                                checked={
                                    dirtyEchartsConfig?.xAxis?.[0]
                                        ?.enableDataZoom || false
                                }
                                onChange={(e) =>
                                    setScrollableChart(e.currentTarget.checked)
                                }
                            />
                            {dirtyEchartsConfig?.xAxis?.[0]?.enableDataZoom && (
                                <>
                                    <Group gap="xs">
                                        <Config.Label>
                                            Initial scroll position
                                        </Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            data={[
                                                {
                                                    label: 'Start',
                                                    value: 'start',
                                                },
                                                { label: 'End', value: 'end' },
                                            ]}
                                            value={
                                                dirtyEchartsConfig?.xAxis?.[0]
                                                    ?.dataZoomAnchor ?? 'start'
                                            }
                                            onChange={(value) =>
                                                setDataZoomAnchor(
                                                    value === 'end'
                                                        ? 'end'
                                                        : 'start',
                                                )
                                            }
                                        />
                                    </Group>
                                    <Group gap="xs">
                                        <Config.Label>
                                            Visible items
                                        </Config.Label>
                                        <NumberInput
                                            size="xs"
                                            maw={80}
                                            min={2}
                                            max={100}
                                            value={
                                                dirtyEchartsConfig?.xAxis?.[0]
                                                    ?.dataZoomItemCount ?? 10
                                            }
                                            onNumberChange={(value) => {
                                                if (value !== undefined)
                                                    setDataZoomItemCount(value);
                                            }}
                                        />
                                    </Group>
                                </>
                            )}
                        </Stack>
                    )}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>{`${dirtyLayout?.flipAxes ? 'X' : 'Y'}-axis label (${
                        dirtyLayout?.flipAxes ? 'bottom' : 'left'
                    })`}</Config.Heading>

                    <LabelEditor
                        value={dirtyEchartsConfig?.yAxis?.[0]?.name ?? ''}
                        placeholder={
                            getAxisName({
                                isAxisTheSameForAllSeries,
                                selectedAxisIndex,
                                axisReference: 'yRef',
                                axisIndex: 0,
                                series: dirtyEchartsConfig?.series,
                                itemsMap,
                            }) || 'Enter axis label'
                        }
                        fields={granularityFields}
                        onChange={(value) => setYAxisName(0, value)}
                    />
                    {showFirstAxisRange && (
                        <AxisMinMax
                            label={`Auto ${dirtyLayout?.flipAxes ? 'x' : 'y'}-axis range`}
                            min={dirtyEchartsConfig?.yAxis?.[0]?.min}
                            max={dirtyEchartsConfig?.yAxis?.[0]?.max}
                            setMin={(newValue) => setYMinValue(0, newValue)}
                            setMax={(newValue) => setYMaxValue(0, newValue)}
                        />
                    )}
                    {showFirstAxisRange && (
                        <AxisMinInterval
                            label="Min tick interval"
                            value={dirtyEchartsConfig?.yAxis?.[0]?.minInterval}
                            onChange={(newValue) =>
                                setYMinInterval(0, newValue)
                            }
                        />
                    )}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>{`${dirtyLayout?.flipAxes ? 'X' : 'Y'}-axis label (${
                        dirtyLayout?.flipAxes ? 'top' : 'right'
                    })`}</Config.Heading>

                    <LabelEditor
                        value={dirtyEchartsConfig?.yAxis?.[1]?.name ?? ''}
                        placeholder={
                            getAxisName({
                                isAxisTheSameForAllSeries,
                                selectedAxisIndex,
                                axisReference: 'yRef',
                                axisIndex: 1,
                                series: dirtyEchartsConfig?.series,
                                itemsMap,
                            }) || 'Enter axis label'
                        }
                        fields={granularityFields}
                        onChange={(value) => setYAxisName(1, value)}
                    />

                    {showSecondAxisRange && (
                        <AxisMinMax
                            label={`Auto ${dirtyLayout?.flipAxes ? 'x' : 'y'}-axis range`}
                            min={dirtyEchartsConfig?.yAxis?.[1]?.min}
                            max={dirtyEchartsConfig?.yAxis?.[1]?.max}
                            setMin={(newValue) => setYMinValue(1, newValue)}
                            setMax={(newValue) => setYMaxValue(1, newValue)}
                        />
                    )}
                    {showSecondAxisRange && (
                        <AxisMinInterval
                            label="Min tick interval"
                            value={dirtyEchartsConfig?.yAxis?.[1]?.minInterval}
                            onChange={(newValue) =>
                                setYMinInterval(1, newValue)
                            }
                        />
                    )}
                </Config.Section>
            </Config>
        </>
    );
};
