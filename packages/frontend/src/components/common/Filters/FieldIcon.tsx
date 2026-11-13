import {
    getItemIcon,
    isCustomBinDimension,
    isCustomSqlDimension,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { forwardRef } from 'react';
import { getFieldColor } from '../../../utils/fieldColors';
import MantineIcon, { type MantineIconProps } from '../MantineIcon';
import { FIELD_ICONS, getItemIconName } from './utils/fieldIconUtils';

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
    ({ item, size = 'lg', stroke = 1.75, selected, ...iconProps }, ref) => {
        const iconColor = selected
            ? 'white'
            : (iconProps.color ?? getFieldColor(item));

        const props = {
            ...iconProps,
            ref,
            size,
            stroke,
            color: iconColor,
        };
        return (
            <MantineIcon icon={FIELD_ICONS[getFieldIcon(item)]} {...props} />
        );
    },
);

export default FieldIcon;
