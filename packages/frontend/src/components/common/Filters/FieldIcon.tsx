import {
    AdditionalMetric,
    Field,
    getItemColor,
    getItemIcon,
    isDimension,
    isField,
    isMetric,
    TableCalculation,
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
import { CSSProperties, FC } from 'react';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/Tree/TreeSingleNode';

const getFieldIcon = (field: Field | TableCalculation | AdditionalMetric) => {
    if (isField(field) && (isDimension(field) || isMetric(field))) {
        return getItemIconName(field.type);
    }
    return getItemIcon(field);
};

const FieldIcon: FC<{
    item: Field | TableCalculation | AdditionalMetric;
    color?: string | undefined;
    size?: number | undefined;
    style?: CSSProperties | undefined;
}> = ({ item, color, size, style }) => {
    const iconColor = color ? color : getItemColor(item);
    const iconSize = size ? size : 20;

    switch (getFieldIcon(item)) {
        case 'citation':
            return <IconAbc color={iconColor} size={iconSize} style={style} />;
        case 'numerical':
            return <Icon123 color={iconColor} size={iconSize} style={style} />;
        case 'calendar':
            return (
                <IconCalendar color={iconColor} size={iconSize} style={style} />
            );
        case 'time':
            return (
                <IconClockHour4
                    color={iconColor}
                    size={iconSize}
                    style={style}
                />
            );
        case 'segmented-control':
            return (
                <IconToggleLeft
                    color={iconColor}
                    size={iconSize}
                    style={style}
                />
            );
        case 'function':
            return (
                <IconMathFunction
                    color={iconColor}
                    size={iconSize}
                    style={style}
                />
            );
        case 'tag':
            return <IconTag color={iconColor} size={iconSize} style={style} />;
    }
};

export default FieldIcon;
