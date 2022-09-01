import { Button, ButtonGroup } from '@blueprintjs/core';
import { SortField } from '@lightdash/common';
import { FC } from 'react';
import { TableColumn } from '../common/Table/types';
import {
    LabelWrapper,
    SortItemContainer,
    StretchDivider,
    StyledXButton,
} from './SortButton.styles';

interface SortItemProps {
    isFirstItem: boolean;
    sort: SortField;
    column?: TableColumn;
}

const SortItem: FC<SortItemProps> = ({ isFirstItem, sort, column }) => {
    const isDescending = !!sort.descending;
    const isAscending = !isDescending;

    return (
        <SortItemContainer $marginTop={isFirstItem ? 0 : 10}>
            <LabelWrapper>
                {isFirstItem ? 'Sort by ' : 'then by '}
                {column?.columnLabel || sort.fieldId}
            </LabelWrapper>

            <StretchDivider />

            <ButtonGroup>
                <Button
                    small
                    intent={isAscending ? 'primary' : 'none'}
                    onClick={() =>
                        isAscending
                            ? undefined
                            : column?.meta?.onAddSort?.({ descending: false })
                    }
                >
                    A-Z
                </Button>

                <Button
                    small
                    intent={isDescending ? 'primary' : 'none'}
                    onClick={() =>
                        isDescending
                            ? undefined
                            : column?.meta?.onAddSort?.({ descending: true })
                    }
                >
                    Z-A
                </Button>
            </ButtonGroup>

            <StyledXButton
                minimal
                small
                icon="small-cross"
                onClick={() => {
                    column?.meta?.onRemoveSort?.();
                }}
            />
        </SortItemContainer>
    );
};

export default SortItem;
