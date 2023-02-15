import { Menu } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import React from 'react';
import {
    AddExistingResourceToSpaceMenuItem,
    AddNewResourceToSpaceMenuItem,
} from './AddResourceToSpaceMenu.styles';
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
}) => {
    return (
        <Menu>
            <AddExistingResourceToSpaceMenuItem
                icon="plus"
                text={`Add existing ${resourceType}`}
                onClick={onAdd}
                style={{ margin: '-5px', marginBottom: '0px' }}
            />
            <AddNewResourceToSpaceMenuItem
                icon="clean"
                text={`Create new ${resourceType}`}
                onClick={onCreate}
                style={{ margin: '-5px', marginTop: '0px' }}
            />
        </Menu>
    );
};

export default AddResourceToSpaceMenu;
