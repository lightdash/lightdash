import { Button } from '@blueprintjs/core';
import { Classes } from '@blueprintjs/popover2';
import { SortField } from '@lightdash/common';
import { FC } from 'react';
import { useColumns } from '../../hooks/useColumns';
import { StyledPopover } from './SortButton.styles';
import SortItem from './SortItem';

type Props = {
    sorts: SortField[];
};

const SortButton: FC<Props> = ({ sorts }) => {
    const columns = useColumns();
    console.log({ columns, sorts });

    return (
        <StyledPopover
            content={
                <>
                    {sorts.map((sort, index) => (
                        <SortItem
                            key={sort.fieldId}
                            isFirstItem={index === 0}
                            sort={sort}
                            column={columns.find((c) => c.id === sort.fieldId)}
                        />
                    ))}
                </>
            }
            interactionKind="click"
            popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
            position="bottom"
        >
            <Button
                minimal
                rightIcon="caret-down"
                text={`Sorted by ${
                    sorts.length === 1 ? '1 field' : `${sorts.length} fields`
                }`}
            />
        </StyledPopover>
    );
};

export default SortButton;
