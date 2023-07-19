import { Menu } from '@mantine/core';
import { IconPlus, IconSquarePlus } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../common/MantineIcon';
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
                <Menu.Item
                    icon={<MantineIcon icon={IconSquarePlus} />}
                    onClick={onAdd}
                >
                    Add existing {resourceType}
                </Menu.Item>
            ) : null}
            <Menu.Item
                icon={<MantineIcon icon={IconPlus} />}
                onClick={onCreate}
            >
                Create new {resourceType}
            </Menu.Item>
        </Menu>
    );
};

export default AddResourceToSpaceMenu;
