import {
    DimensionType,
    MetricType,
    TableCalculationType,
} from '@lightdash/common';
import {
    IconNumber123,
    IconAbc,
    IconCalendar,
    IconClockHour4,
    IconMathFunction,
    IconTag,
    IconToggleLeft,
} from '@tabler/icons-react';

export const getItemIconName = (
    type: DimensionType | MetricType | TableCalculationType,
) => {
    switch (type) {
        case DimensionType.STRING:
        case MetricType.STRING:
        case TableCalculationType.STRING:
            return 'citation';
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case TableCalculationType.NUMBER:
            return 'numerical';
        case DimensionType.DATE:
        case MetricType.DATE:
        case TableCalculationType.DATE:
            return 'calendar';
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
        case TableCalculationType.BOOLEAN:
            return 'segmented-control';
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP:
        case TableCalculationType.TIMESTAMP:
            return 'time';
        default:
            return 'numerical';
    }
};

export const FIELD_ICONS = {
    citation: IconAbc,
    numerical: IconNumber123,
    calendar: IconCalendar,
    time: IconClockHour4,
    'segmented-control': IconToggleLeft,
    function: IconMathFunction,
    tag: IconTag,
} as const;
