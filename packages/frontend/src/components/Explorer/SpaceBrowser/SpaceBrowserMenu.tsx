import {
    Button,
    Menu,
    MenuDivider,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';

interface Props {
    spaceUuid: string;
    onUpdateSpace: (uuid: string) => void;
    onDeleteSpace: (uuid: string) => void;
}

export const SpaceBrowserMenu: React.FC<Props> = ({
    spaceUuid,
    onUpdateSpace,
    onDeleteSpace,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Popover2
            isOpen={isOpen}
            onInteraction={setIsOpen}
            content={
                <Menu>
                    <MenuItem
                        icon="edit"
                        text="Rename"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onUpdateSpace(spaceUuid);
                            setIsOpen(false);
                        }}
                    />
                    <MenuDivider />

                    <MenuItem
                        icon="delete"
                        intent="danger"
                        text="Remove space"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onDeleteSpace(spaceUuid);
                            setIsOpen(false);
                        }}
                    />
                </Menu>
            }
            position={PopoverPosition.BOTTOM_LEFT}
            lazy
        >
            <Tooltip2 content="View options">
                <Button
                    minimal
                    icon="more"
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsOpen(true);
                    }}
                />
            </Tooltip2>
        </Popover2>
    );
};
