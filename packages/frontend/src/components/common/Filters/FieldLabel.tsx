import {
    isAdditionalMetric,
    isCustomDimension,
    isField,
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Text, type TextProps } from '@mantine-8/core';
import { type FC } from 'react';

interface FieldLabelProps {
    item: Field | TableCalculation | AdditionalMetric | CustomDimension;
    hideTableName?: boolean;
    fz?: TextProps['fz'];
}

const FieldLabel: FC<FieldLabelProps> = ({
    item,
    hideTableName = false,
    fz,
}) => {
    return (
        <Text span fz={fz}>
            {!hideTableName && isField(item) ? `${item.tableLabel} ` : ''}

            <Text span fz={fz} fw={500}>
                {isCustomDimension(item)
                    ? item.name
                    : isField(item) || isAdditionalMetric(item)
                      ? item.label
                      : item.displayName}
            </Text>
        </Text>
    );
};

export default FieldLabel;
