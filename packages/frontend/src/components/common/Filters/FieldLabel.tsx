import { FilterItem, isField } from '@lightdash/common';
import { FC } from 'react';
import styled from 'styled-components';

interface FieldLabelProps {
    item: FilterItem;
}

const BolderText = styled.span`
    font-weight: 600;
`;

const FieldLabel: FC<FieldLabelProps> = ({ item }) => {
    return (
        <span>
            {isField(item) ? `${item.tableLabel} ` : ''}
            <BolderText>
                {isField(item) ? item.label : item.displayName}
            </BolderText>
        </span>
    );
};

export default FieldLabel;
