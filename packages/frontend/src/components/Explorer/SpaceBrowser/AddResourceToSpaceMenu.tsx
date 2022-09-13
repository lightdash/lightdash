import { Menu, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import React from 'react';
import { AddToSpaceResources } from './AddResourceToSpaceModal';

interface AddResourceToSpaceMenuProps {
    resourceType: AddToSpaceResources;
    onAdd: () => void;
    onCreate: () => void;
}

const AddResourceToSpaceMenu: React.FC<AddResourceToSpaceMenuProps> = ({
    resourceType,
    onAdd,
    onCreate,
    children,
}) => {
    return (
        <Popover2
            captureDismiss
            position={PopoverPosition.BOTTOM_RIGHT}
            content={
                <Menu>
                    <MenuItem2
                        text={`Add existing ${resourceType}`}
                        onClick={onAdd}
                    />
                    <MenuItem2
                        text={`Create new ${resourceType}`}
                        onClick={onCreate}
                    />
                </Menu>
            }
        >
            {children}
        </Popover2>
    );
};

export default AddResourceToSpaceMenu;
