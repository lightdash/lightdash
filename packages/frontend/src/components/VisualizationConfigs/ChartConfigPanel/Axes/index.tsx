import {
    getAxisName,
    getDateGroupLabel,
    getItemLabelWithoutTableName,
    isNumericItem,
    type ItemsMap,
} from '@lightdash/common';
import {
    Checkbox,
    Group,
    NumberInput,
    SegmentedControl,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import { IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
import { Config } from '../../common/Config';
import { AxisMinMax } from './AxisMinMax';

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
        setInverseX,
        setXAxisLabelRotation,
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
                            <SegmentedControl
                                defaultValue={
                                    dirtyEchartsConfig?.xAxis?.[0]?.inverse
                                        ? 'descending'
                                        : 'ascending'
                                }
                                data={[
                                    {
                                        value: 'ascending',
                                        label: (
                                            <MantineIcon
                                                icon={IconSortAscending}
                                            />
                                        ),
                                    },
                                    {
                                        value: 'descending',
                                        label: (
                                            <MantineIcon
                                                icon={IconSortDescending}
                                            />
                                        ),
                                    },
                                ]}
                                onChange={(value) => {
                                    setInverseX(value === 'descending');
                                }}
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
        </Stack>
    );
};
