import { getDefaultZIndex, Menu } from '@mantine-8/core';
import { IconLogout, IconUserCircle, IconUserPlus } from '@tabler/icons-react';
import posthog from 'posthog-js';
import { type FC } from 'react';
import { Link } from 'react-router';
import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import useApp from '../../providers/App/useApp';
import { UserAvatar } from '../UserAvatar';
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
            zIndex={getDefaultZIndex('max')}
            portalProps={{ target: '#navbar-header' }}
        >
            <Menu.Target>
                <UserAvatar />
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    role="menuitem"
                    component={Link}
                    to="/generalSettings"
                    leftSection={<MantineIcon icon={IconUserCircle} />}
                >
                    User settings
                </Menu.Item>

                {user.data?.ability?.can('create', 'InviteLink') ? (
                    <Menu.Item
                        role="menuitem"
                        component={Link}
                        to="/generalSettings/userManagement?to=invite"
                        leftSection={<MantineIcon icon={IconUserPlus} />}
                    >
                        Invite user
                    </Menu.Item>
                ) : null}

                <Menu.Item
                    role="menuitem"
                    onClick={() => logout()}
                    leftSection={<MantineIcon icon={IconLogout} />}
                >
                    Logout
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

export default UserMenu;
