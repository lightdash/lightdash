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
        <>
            <Popover2
                minimal
                captureDismiss
                content={
                    <Menu>
                        <MenuItem2
                            icon="edit"
                            text="Rename"
                            onClick={onRename}
                        />
                        <MenuDivider />
                        <MenuItem2
                            icon="delete"
                            intent="danger"
                            text="Remove space"
                            onClick={onDelete}
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_LEFT}
            >
                {children}
            </Popover2>
        </>
    );
};
