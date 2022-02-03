import { AnchorButton } from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';

const DashboardFilter: FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Popover2
                content={<p>HOLAAA</p>}
                interactionKind="click"
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                isOpen={isOpen}
                onInteraction={setIsOpen}
                position="bottom"
                lazy={false}
            >
                <AnchorButton minimal icon="filter-list">
                    Add filter
                </AnchorButton>
            </Popover2>
        </>
    );
};

export default DashboardFilter;
