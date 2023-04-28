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
import { forwardRef } from 'react';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/Tree/TreeSingleNode';
import MantineIcon, { MantineIconProps } from '../MantineIcon';

const getFieldIcon = (field: Field | TableCalculation | AdditionalMetric) => {
    if (isField(field) && (isDimension(field) || isMetric(field))) {
        return getItemIconName(field.type);
    }
    return getItemIcon(field);
};

type Props = Omit<MantineIconProps, 'icon'> & {
    item: Field | TableCalculation | AdditionalMetric;
};

const FieldIcon = forwardRef<SVGSVGElement, Props>(
    ({ item, size = 'lg', ...iconProps }, ref) => {
        const iconColor = iconProps.color ?? getItemColor(item);
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
