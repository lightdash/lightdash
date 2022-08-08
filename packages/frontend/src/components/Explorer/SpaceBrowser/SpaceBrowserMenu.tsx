import { Menu, MenuDivider, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { DeleteSpaceModal } from './DeleteSpaceModal';
import { EditSpaceModal } from './EditSpaceModal';

interface Props {
    spaceUuid: string;
}

export const SpaceBrowserMenu: React.FC<Props> = ({ spaceUuid, children }) => {
    const [updateSpace, setUpdateSpace] = useState<boolean>(false);
    const [deleteSpace, setDeleteSpace] = useState<boolean>(false);
    return (
        <>
            <Popover2
                captureDismiss
                content={
                    <Menu>
                        <MenuItem2
                            icon="edit"
                            text="Rename"
                            onClick={(e) => {
                                setUpdateSpace(true);
                            }}
                        />
                        <MenuDivider />
                        <MenuItem2
                            icon="delete"
                            intent="danger"
                            text="Remove space"
                            onClick={(e) => {
                                setDeleteSpace(true);
                            }}
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_LEFT}
            >
                {children}
            </Popover2>
            {updateSpace && (
                <EditSpaceModal
                    spaceUuid={spaceUuid}
                    onClose={() => {
                        setUpdateSpace(false);
                    }}
                ></EditSpaceModal>
            )}
            {deleteSpace && (
                <DeleteSpaceModal
                    spaceUuid={spaceUuid}
                    onClose={() => {
                        setDeleteSpace(false);
                    }}
                ></DeleteSpaceModal>
            )}
        </>
    );
};
