import { Button, ButtonGroup } from '@blueprintjs/core';
import { SortField } from '@lightdash/common';
import { FC } from 'react';
import { TableColumn } from '../common/Table/types';
import { LabelWrapper, StretchDivider } from './SortButton.styles';

interface SortItemProps {
    isFirstItem: boolean;
    sort: SortField;
    column?: TableColumn;
}

const SortItem: FC<SortItemProps> = ({ isFirstItem, sort, column }) => {
    const isDescending = !!sort.descending;
    const isAscending = !isDescending;

    console.log({ this_is_a_col: column });

    return (
        <>
            <LabelWrapper>
                {isFirstItem ? 'Sort by' : 'then by'}{' '}
                {column ? column.header() : sort.fieldId}
            </LabelWrapper>

            <StretchDivider />

            <ButtonGroup>
                <Button
                    small
                    intent={isAscending ? 'primary' : 'none'}
                    onClick={() =>
                        isAscending
                            ? column?.meta?.onAddSort?.({ descending: false })
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
                            ? column?.meta?.onAddSort?.({ descending: true })
                            : column?.meta?.onAddSort?.({ descending: true })
                    }
                >
                    Z-A
                </Button>
            </ButtonGroup>
        </>
    );
};

export default SortItem;
