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
import { FC } from 'react';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/Tree/TreeSingleNode';

const getFieldIcon = (field: Field | TableCalculation | AdditionalMetric) => {
    if (isField(field) && (isDimension(field) || isMetric(field))) {
        return getItemIconName(field.type);
    }
    return getItemIcon(field);
};

interface FieldIconProps {
    item: Field | TableCalculation | AdditionalMetric;
}

const FieldIcon: FC<FieldIconProps> = ({ item }) => {
    return <Icon icon={getFieldIcon(item)} color={getItemColor(item)} />;
};

export default FieldIcon;
