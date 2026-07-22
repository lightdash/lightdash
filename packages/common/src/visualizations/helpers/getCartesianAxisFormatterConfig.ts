import type { AnyType } from '../../types/any';
import {
    DimensionType,
    isDimension,
    isField,
    isTableCalculation,
    type ItemsMap,
} from '../../types/field';
import { TimeFrames } from '../../types/timeFrames';
import { formatItemValue, hasFormatting } from '../../utils/formatting';
import { getItemId } from '../../utils/item';
import {
    getLabelForValue,
    type LabelValueMap,
} from '../../utils/labelValueMap';
import { isTimeInterval, timeFrameConfigs } from '../../utils/timeFrames';

/**
 * Get the formatter config for a cartesian axis
 * @param axisItem - Axis item
 * @param longestLabelWidth - Longest label width
 * @param rotate - Rotate
 * @param defaultNameGap - Default name gap
 * @param show - Show
 * @param parameters - Parameter values for conditional formatting
 * @returns Axis config
 */
export const getCartesianAxisFormatterConfig = ({
    axisItem,
    longestLabelWidth,
    rotate,
    defaultNameGap,
    show,
    parameters,
    timezone,
    displayTimezone,
    labelValueMap,
}: {
    axisItem: ItemsMap[string] | undefined;
    longestLabelWidth?: number;
    rotate?: number;
    defaultNameGap?: number;
    show?: boolean;
    parameters?: Record<string, unknown>;
    timezone?: string;
    displayTimezone?: string;
    labelValueMap?: LabelValueMap;
}) => {
    // Remove axis labels, lines, and ticks if the axis is not shown
    // This is done to prevent the grid from disappearing when the axis is not shown
    if (!show) {
        return {
            axisLabel: undefined,
            axisLine: {
                show,
            },
            axisTick: {
                show,
            },
        };
    }

    const isTimestamp =
        isField(axisItem) &&
        (axisItem.type === DimensionType.DATE ||
            axisItem.type === DimensionType.TIMESTAMP);
    // Only apply axis formatting if the axis is NOT a date or timestamp
    const hasFormattingConfig = !isTimestamp && hasFormatting(axisItem);
    const axisMinInterval =
        isDimension(axisItem) &&
        axisItem.timeInterval &&
        isTimeInterval(axisItem.timeInterval) &&
        timeFrameConfigs[axisItem.timeInterval].getAxisMinInterval();

    const axisLabelFormatter =
        isDimension(axisItem) &&
        axisItem.timeInterval &&
        isTimeInterval(axisItem.timeInterval) &&
        timeFrameConfigs[axisItem.timeInterval].getAxisLabelFormatter();

    const axisConfig: Record<string, unknown> = {};

    if (axisItem && (hasFormattingConfig || axisMinInterval)) {
        axisConfig.axisLabel = {
            formatter: (value: AnyType) =>
                formatItemValue(
                    axisItem,
                    value,
                    true,
                    parameters,
                    timezone,
                    displayTimezone,
                ),
        };
        axisConfig.axisPointer = {
            label: {
                formatter: (value: unknown) =>
                    value &&
                    typeof value === 'object' &&
                    'value' in value &&
                    value.value !== undefined
                        ? formatItemValue(
                              axisItem,
                              value.value,
                              true,
                              parameters,
                              timezone,
                              displayTimezone,
                          )
                        : undefined,
            },
        };
    } else if (axisLabelFormatter) {
        axisConfig.axisLabel = {
            formatter: axisLabelFormatter,
            rich: {
                bold: {
                    fontWeight: 'bold',
                },
            },
        };
        axisConfig.axisPointer = {
            label: {
                formatter: (value: unknown) =>
                    value &&
                    typeof value === 'object' &&
                    'value' in value &&
                    value.value !== undefined
                        ? formatItemValue(
                              axisItem,
                              value.value,
                              true,
                              parameters,
                              timezone,
                              displayTimezone,
                          )
                        : undefined,
            },
        };
    } else if (
        axisItem !== undefined &&
        isTableCalculation(axisItem) &&
        axisItem.type === undefined
    ) {
        axisConfig.axisLabel = {
            formatter: (value: AnyType) =>
                formatItemValue(axisItem, value, false, parameters, timezone),
        };
        axisConfig.axisPointer = {
            label: {
                formatter: (value: unknown) =>
                    value &&
                    typeof value === 'object' &&
                    'value' in value &&
                    value.value !== undefined
                        ? formatItemValue(
                              axisItem,
                              value.value,
                              false,
                              parameters,
                              timezone,
                          )
                        : undefined,
            },
        };
    } else if (
        axisItem &&
        isDimension(axisItem) &&
        axisItem.timeInterval &&
        isTimeInterval(axisItem.timeInterval)
    ) {
        // Some int numbers are converted to float by default on echarts
        // This is to ensure the value is correctly formatted on some types
        switch (axisItem.timeInterval) {
            case TimeFrames.WEEK_NUM:
            case TimeFrames.WEEK:
                axisConfig.axisLabel = {
                    formatter: (value: AnyType) =>
                        formatItemValue(
                            axisItem,
                            value,
                            true,
                            parameters,
                            timezone,
                        ),
                };

                axisConfig.axisPointer = {
                    label: {
                        formatter: (value: unknown) =>
                            value &&
                            typeof value === 'object' &&
                            'value' in value &&
                            value.value !== undefined
                                ? formatItemValue(
                                      axisItem,
                                      value.value,
                                      true,
                                      parameters,
                                  )
                                : undefined,
                    },
                };
                break;
            default:
        }
    }
    // Only categorical axes are labelled — a label dimension on a
    // date/time-interval axis keeps its native (min-interval/rich) formatting.
    const isCategoricalAxis =
        !isTimestamp &&
        !(isDimension(axisItem) && axisItem.timeInterval !== undefined);
    const axisFieldId =
        axisItem && isField(axisItem) && isCategoricalAxis
            ? getItemId(axisItem)
            : undefined;
    const axisLabels = axisFieldId ? labelValueMap?.[axisFieldId] : undefined;
    if (axisFieldId && axisLabels) {
        axisConfig.axisLabel = {
            formatter: (value: AnyType) =>
                getLabelForValue(labelValueMap, axisFieldId, value) ??
                formatItemValue(
                    axisItem,
                    value,
                    true,
                    parameters,
                    timezone,
                    displayTimezone,
                ),
        };
        axisConfig.axisPointer = {
            label: {
                formatter: (value: unknown) => {
                    const raw =
                        value && typeof value === 'object' && 'value' in value
                            ? value.value
                            : value;
                    return (
                        getLabelForValue(labelValueMap, axisFieldId, raw) ??
                        formatItemValue(
                            axisItem,
                            raw,
                            true,
                            parameters,
                            timezone,
                            displayTimezone,
                        )
                    );
                },
            },
        };
    }

    if (axisMinInterval) {
        axisConfig.minInterval = axisMinInterval;
    }

    axisConfig.nameGap = defaultNameGap || 0;
    if (rotate) {
        const rotateRadians = (rotate * Math.PI) / 180;
        const oppositeSide = (longestLabelWidth || 0) * Math.sin(rotateRadians);
        axisConfig.axisLabel = {
            ...(axisConfig.axisLabel || {}),
            rotate,
            margin: 12,
        };
        axisConfig.nameGap = oppositeSide + 15;
    } else {
        axisConfig.axisLabel = {
            ...(axisConfig.axisLabel || {}),
            hideOverlap: true,
        };
    }

    return axisConfig;
};
