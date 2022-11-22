import { Icon } from '@blueprintjs/core';
import {
    FilterableField,
    FilterItem,
    getItemColor,
    getItemIcon,
    isDimension,
    isField,
    isMetric,
} from '@lightdash/common';
import { FC } from 'react';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/Tree/TreeSingleNode';

const getFieldIcon = (field: FilterItem) => {
    if (isField(field) && (isDimension(field) || isMetric(field))) {
        return getItemIconName(field.type);
    }
    return getItemIcon(field);
};

interface FieldIconProps {
    item: FilterItem;
}

const FieldIcon: FC<FieldIconProps> = ({ item }) => {
    return <Icon icon={getFieldIcon(item)} color={getItemColor(item)} />;
};

export default FieldIcon;
