import {
    DimensionType,
    MetricType,
    TableCalculationType,
} from '@lightdash/common';

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
