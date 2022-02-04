import { Classes, Popover2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import {
    FilterValues,
    TagContainer,
    TagsWrapper,
} from './ActiveFilters.styles';

const ActiveFilters: FC = () => {
    const filterData = [
        {
            id: 'test',
            target: {
                fieldId: 'order_status',
            },
            operator: 'null',
            values: ['pending'],
        },
        {
            id: 'test2',
            target: {
                fieldId: 'order_status_per',
            },
            operator: 'null',
            values: ['full'],
        },
    ];

    const [isOpen, setIsOpen] = useState(false);
    if (!filterData) return null;
    return (
        <TagsWrapper>
            {filterData.map((item) => (
                <Popover2
                    content={<p>test</p>}
                    interactionKind="click"
                    popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                    isOpen={isOpen}
                    onInteraction={setIsOpen}
                    position="bottom"
                    lazy={false}
                >
                    <TagContainer key={item.id}>
                        {`${item.target.fieldId}: `}
                        <FilterValues>{item.values}</FilterValues>
                    </TagContainer>
                </Popover2>
            ))}
        </TagsWrapper>
    );
};

export default ActiveFilters;
