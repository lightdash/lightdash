import { Menu } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import React from 'react';
import { AddResourceToSpaceMenuContainer } from './SpaceBrowser.styles';

interface AddResourceToSpaceMenuProps {
    onAdd: () => void;
    onCreate: () => void;
}

const AddResourceToSpaceMenu: React.FC<AddResourceToSpaceMenuProps> = ({
    onAdd,
    onCreate,
}) => {
    return (
        <AddResourceToSpaceMenuContainer>
            <MenuItem2
                icon="plus"
                text={`Add existing`}
                onClick={onAdd}
                style={{ margin: '-3px' }}
            />
            <MenuItem2
                icon="clean"
                text={`Create new`}
                onClick={onCreate}
                style={{ margin: '-3px' }}
            />
        </AddResourceToSpaceMenuContainer>
    );
};

export default AddResourceToSpaceMenu;
