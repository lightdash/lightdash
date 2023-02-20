import { Menu } from '@blueprintjs/core';
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
    hasSavedResources: boolean;
}

const AddResourceToSpaceMenu: React.FC<AddResourceToSpaceMenuProps> = ({
    resourceType,
    onAdd,
    onCreate,
    hasSavedResources,
}) => {
    return (
        <Menu>
            {hasSavedResources ? (
                <AddExistingResourceToSpaceMenuItem
                    icon="plus"
                    text={`Add existing ${resourceType}`}
                    onClick={onAdd}
                />
            ) : null}
            <AddNewResourceToSpaceMenuItem
                icon="clean"
                text={`Create new ${resourceType}`}
                onClick={onCreate}
                addExistingIsHidden={!hasSavedResources}
            />
        </Menu>
    );
};

export default AddResourceToSpaceMenu;
