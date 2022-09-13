import { Menu, MenuDivider, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import React from 'react';

interface Props {
    onRename: () => void;
    onDelete: () => void;
}

export const SpaceBrowserMenu: React.FC<Props> = ({
    onRename,
    onDelete,
    children,
}) => {
    return (
        <Popover2
            captureDismiss
            position={PopoverPosition.BOTTOM_RIGHT}
            content={
                <Menu>
                    <MenuItem2 icon="edit" text="Rename" onClick={onRename} />
                    <MenuDivider />
                    <MenuItem2
                        icon="cross"
                        intent="danger"
                        text="Remove space"
                        onClick={onDelete}
                    />
                </Menu>
            }
        >
            {children}
        </Popover2>
    );
};
