import { Menu } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import React from 'react';
import { ResourceListType } from '../../common/ResourceList/ResourceTypeUtils';

interface AddResourceToSpaceMenuProps {
    resourceType: ResourceListType;
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
            <MenuItem2
                icon="plus"
                text={`Add existing ${resourceType}`}
                onClick={onAdd}
                style={{ margin: '-3px' }}
            />
            <MenuItem2
                icon="clean"
                text={`Create new ${resourceType}`}
                onClick={onCreate}
                style={{ margin: '-3px' }}
            />
        </Menu>
    );
};

export default AddResourceToSpaceMenu;
