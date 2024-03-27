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
import { useCallback, type FC } from 'react';
import { useToggle } from 'react-use';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { ConfigGroup } from './common/ConfigGroup';

interface MinMaxProps {
    label: string;
    min: string | undefined;
    max: string | undefined;
    setMin: (value: string | undefined) => void;
    setMax: (value: string | undefined) => void;
}

const AxisMinMax: FC<MinMaxProps> = ({ label, min, max, setMin, setMax }) => {
    const [isAuto, toggleAuto] = useToggle(!(min || max));
    const { track } = useTracking();

    const clearRange = useCallback(() => {
        if (!isAuto) {
            setMin(undefined);
            setMax(undefined);
        }
        return;
    }, [isAuto, setMin, setMax]);

    return (
        <Group noWrap spacing="xs">
            <Switch
                size="xs"
                label={
                    isAuto && (
                        <ConfigGroup.SubLabel>{label}</ConfigGroup.SubLabel>
                    )
                }
                checked={isAuto}
                onChange={() => {
                    toggleAuto((prev: boolean) => !prev);
                    clearRange();
                    track({
                        name: EventName.CUSTOM_AXIS_RANGE_TOGGLE_CLICKED,
                        properties: {
                            custom_axis_range: isAuto,
                        },
                    });
                }}
                styles={{
                    label: {
                        paddingLeft: 4,
                    },
                }}
            />
            {!isAuto && (
                <Group noWrap spacing="xs">
                    <ConfigGroup.SubLabel>Min</ConfigGroup.SubLabel>
                    <TextInput
                        size="xs"
                        placeholder="Min"
                        defaultValue={min || undefined}
                        onBlur={(e) => setMin(e.currentTarget.value)}
                    />
                    <ConfigGroup.SubLabel>Max</ConfigGroup.SubLabel>
                    <TextInput
                        size="xs"
                        placeholder="Max"
                        defaultValue={max || undefined}
                        onBlur={(e) => setMax(e.currentTarget.value)}
                    />
                </Group>
            )}
        </Group>
    );
};
type Props = {
    itemsMap: ItemsMap | undefined;
};

const AxesOptions: FC<Props> = ({ itemsMap }) => {
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
        setXMaxValue,
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
            <ConfigGroup>
                <ConfigGroup.Label>{`${
                    dirtyLayout?.flipAxes ? 'Y' : 'X'
                }-axis label`}</ConfigGroup.Label>
                <TextInput
                    size="xs"
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
                <Group spacing="xs">
                    <Group spacing="xs">
                        <ConfigGroup.SubLabel>Sort</ConfigGroup.SubLabel>
                        <SegmentedControl
                            size="xs"
                            defaultValue={
                                dirtyEchartsConfig?.xAxis?.[0]?.inverse
                                    ? 'descending'
                                    : 'ascending'
                            }
                            data={[
                                {
                                    value: 'ascending',
                                    label: (
                                        <MantineIcon icon={IconSortAscending} />
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
                            <ConfigGroup.SubLabel>
                                Rotation
                            </ConfigGroup.SubLabel>
                            <NumberInput
                                type="number"
                                defaultValue={
                                    dirtyEchartsConfig?.xAxis?.[0].rotate || 0
                                }
                                min={0}
                                max={90}
                                step={15}
                                size="xs"
                                maw={54}
                                rightSection="°"
                                onChange={(value) => {
                                    setXAxisLabelRotation(Number(value));
                                }}
                            />
                        </Group>
                    )}
                </Group>
            </ConfigGroup>

            <ConfigGroup>
                <ConfigGroup.Label>{`${
                    dirtyLayout?.flipAxes ? 'X' : 'Y'
                }-axis label (${
                    dirtyLayout?.flipAxes ? 'bottom' : 'left'
                })`}</ConfigGroup.Label>

                <TextInput
                    size="xs"
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
            </ConfigGroup>

            <ConfigGroup>
                <ConfigGroup.Label>{`${
                    dirtyLayout?.flipAxes ? 'X' : 'Y'
                }-axis label (${
                    dirtyLayout?.flipAxes ? 'top' : 'right'
                })`}</ConfigGroup.Label>

                <TextInput
                    size="xs"
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
            </ConfigGroup>

            <ConfigGroup>
                <ConfigGroup.Label>Show grid</ConfigGroup.Label>

                <Stack spacing="xs">
                    <Checkbox
                        size="xs"
                        label={
                            <ConfigGroup.SubLabel>{`${
                                dirtyLayout?.flipAxes ? 'Y' : 'X'
                            }-axis`}</ConfigGroup.SubLabel>
                        }
                        checked={!!dirtyLayout?.showGridX}
                        onChange={() => {
                            setShowGridX(!dirtyLayout?.showGridX);
                        }}
                        styles={{
                            label: {
                                paddingLeft: 10,
                            },
                        }}
                    />

                    <Checkbox
                        size="xs"
                        label={
                            <ConfigGroup.SubLabel>{`${
                                dirtyLayout?.flipAxes ? 'X' : 'Y'
                            }-axis`}</ConfigGroup.SubLabel>
                        }
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
                        styles={{
                            body: {
                                alignItems: 'center',
                            },
                            label: {
                                paddingLeft: 10,
                            },
                        }}
                    />
                </Stack>
            </ConfigGroup>
        </Stack>
    );
};

export default AxesOptions;
