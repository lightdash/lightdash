import { Menu } from '@mantine/core';
import { IconLogout, IconUserCircle, IconUserPlus } from '@tabler/icons-react';
import posthog from 'posthog-js';
import { type FC } from 'react';
import { Link } from 'react-router-dom';

import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import { useApp } from '../../providers/AppProvider';
import { UserAvatar } from '../Avatar';
import MantineIcon from '../common/MantineIcon';

const UserMenu: FC = () => {
    const { user } = useApp();
    const { mutate: logout } = useLogoutMutation({
        onSuccess: () => {
            posthog.reset();
            window.location.href = '/login';
        },
    });

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <UserAvatar />
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    role="menuitem"
                    component={Link}
                    to="/generalSettings"
                    icon={<MantineIcon icon={IconUserCircle} />}
                >
                    User settings
                </Menu.Item>

                {user.data?.ability?.can('create', 'InviteLink') ? (
                    <Menu.Item
                        role="menuitem"
                        component={Link}
                        to="/generalSettings/userManagement?to=invite"
                        icon={<MantineIcon icon={IconUserPlus} />}
                    >
                        Invite user
                    </Menu.Item>
                ) : null}

                <Menu.Item
                    role="menuitem"
                    onClick={() => logout()}
                    icon={<MantineIcon icon={IconLogout} />}
                >
                    Logout
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

export default UserMenu;
