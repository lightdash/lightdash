import {
    DimensionType,
    getItemColor,
    getItemIcon,
    isCustomBinDimension,
    isCustomSqlDimension,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
    MetricType,
    TableCalculationType,
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import {
    Icon123,
    IconAbc,
    IconCalendar,
    IconClockHour4,
    IconMathFunction,
    IconTag,
    IconToggleLeft,
} from '@tabler/icons-react';
import { forwardRef } from 'react';
import MantineIcon, { type MantineIconProps } from '../MantineIcon';

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

const getFieldIcon = (
    field: Field | TableCalculation | AdditionalMetric | CustomDimension,
) => {
    if (isCustomBinDimension(field)) {
        return 'citation';
    }
    if (isCustomSqlDimension(field)) {
        return getItemIconName(field.dimensionType);
    }
    if (
        (isField(field) && (isDimension(field) || isMetric(field))) ||
        isTableCalculation(field)
    ) {
        if (field.type) return getItemIconName(field.type);
    }

    return getItemIcon(field);
};

type Props = Omit<MantineIconProps, 'icon'> & {
    item: Field | TableCalculation | AdditionalMetric | CustomDimension;
    selected?: boolean;
};

const FieldIcon = forwardRef<SVGSVGElement, Props>(
    ({ item, size = 'lg', selected, ...iconProps }, ref) => {
        const iconColor = selected
            ? 'white'
            : iconProps.color ?? getItemColor(item);

        const props = {
            ...iconProps,
            ref,
            size,
            color: iconColor,
        };
        switch (getFieldIcon(item)) {
            case 'citation':
                return <MantineIcon icon={IconAbc} {...props} />;
            case 'numerical':
                return <MantineIcon icon={Icon123} {...props} />;
            case 'calendar':
                return <MantineIcon icon={IconCalendar} {...props} />;
            case 'time':
                return <MantineIcon icon={IconClockHour4} {...props} />;
            case 'segmented-control':
                return <MantineIcon icon={IconToggleLeft} {...props} />;
            case 'function':
                return <MantineIcon icon={IconMathFunction} {...props} />;
            case 'tag':
                return <MantineIcon icon={IconTag} {...props} />;
        }
    },
);

export default FieldIcon;
