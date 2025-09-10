import { Button, Menu } from '@mantine/core';

import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    onClickDuplicate: () => void;
    size?: 'md' | 'xs';
};

/**
 * Reusable button for adding new custom roles that includes a menu to decide between creating
 * a new role or duplicating an existing one.
 */
export const AddRoleButton: FC<Props> = ({ onClickDuplicate, size = 'md' }) => {
    return (
        <Menu position="bottom-end">
            <Menu.Target>
                <Button size={size} leftIcon={<MantineIcon icon={IconPlus} />}>
                    Add role
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    component={Link}
                    to="/generalSettings/customRoles/create"
                >
                    Create new role
                </Menu.Item>
                <Menu.Item onClick={onClickDuplicate}>
                    Duplicate existing role
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
