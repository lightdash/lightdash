import {
    AdditionalMetric,
    Field,
    isAdditionalMetric,
    isField,
    TableCalculation,
} from '@lightdash/common';
import { FC } from 'react';
import styled from 'styled-components';

interface FieldLabelProps {
    item: Field | TableCalculation | AdditionalMetric;
}

const BolderText = styled.span`
    font-weight: 600;
`;

const FieldLabel: FC<FieldLabelProps> = ({ item }) => {
    return (
        <span>
            {isField(item) ? `${item.tableLabel} ` : ''}
            <BolderText>
                {isField(item) || isAdditionalMetric(item)
                    ? item.label
                    : item.displayName}
            </BolderText>
        </span>
    );
};

export default FieldLabel;
