import { Icon } from '@blueprintjs/core';
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
    IconAlphabetLatin,
    IconAppWindow,
    IconCalendar,
    IconChartAreaLine,
    IconClockHour4,
    IconFolder,
    IconFunction,
    IconLayoutDashboard,
    IconLetterCase,
    IconMathFunction,
    IconQuote,
    IconTable,
    IconTag,
    IconToggleLeft,
} from '@tabler/icons-react';
import { CSSProperties, FC } from 'react';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/Tree/TreeSingleNode';

const getFieldIcon = (field: Field | TableCalculation | AdditionalMetric) => {
    if (isField(field) && (isDimension(field) || isMetric(field))) {
        return getItemIconName(field.type);
    }
    switch (field.type) {
        case 'dashboard':
            return 'dashboard';
        case 'saved_chart':
            return 'chart';
        case 'space':
            return 'space';
        case 'table':
            return 'table';
        case 'page':
            return 'page';
    }
    if (field.type === 'field') {
        switch (field.typeLabel.toLowerCase()) {
            case 'dimension':
                return 'citation';
            case 'metric':
                return 'numerical';
        }
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
        case 'dashboard':
            return (
                <IconLayoutDashboard
                    color={iconColor}
                    size={iconSize}
                    style={style}
                />
            );
        case 'chart':
            return (
                <IconChartAreaLine
                    color={iconColor}
                    size={iconSize}
                    style={style}
                />
            );
        case 'space':
            return (
                <IconFolder color={iconColor} size={iconSize} style={style} />
            );
        case 'table':
            return (
                <IconTable color={iconColor} size={iconSize} style={style} />
            );
        case 'page':
            return (
                <IconAppWindow
                    color={iconColor}
                    size={iconSize}
                    style={style}
                />
            );
    }
};

export default FieldIcon;
