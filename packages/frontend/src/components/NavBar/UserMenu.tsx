import { FeatureFlags } from '@lightdash/common';
import { getDefaultZIndex, Menu } from '@mantine/core';
import {
    IconHistory,
    IconLogout,
    IconUserCircle,
    IconUserPlus,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { UserAvatar } from '../UserAvatar';
import { ThemeSwitcherMenuItem } from './ThemeSwitcher';

const UserMenu: FC = () => {
    const { user } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const queryHistoryFlag = useServerFeatureFlag(FeatureFlags.QueryHistory);
    const { mutate: logout } = useLogoutMutation({
        onSuccess: () => {
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
                <ThemeSwitcherMenuItem />

                {user.data?.isSetupComplete ? (
                    <Menu.Item
                        role="menuitem"
                        component={Link}
                        to="/generalSettings"
                        leftSection={<MantineIcon icon={IconUserCircle} />}
                    >
                        User settings
                    </Menu.Item>
                ) : null}

                {user.data?.isSetupComplete &&
                user.data?.ability?.can('create', 'InviteLink') ? (
                    <Menu.Item
                        role="menuitem"
                        component={Link}
                        to="/generalSettings/userManagement?to=invite"
                        leftSection={<MantineIcon icon={IconUserPlus} />}
                    >
                        Invite user
                    </Menu.Item>
                ) : null}

                {queryHistoryFlag.data?.enabled && activeProjectUuid ? (
                    <Menu.Item
                        role="menuitem"
                        component={Link}
                        to={`/projects/${activeProjectUuid}/query-history`}
                        leftSection={<MantineIcon icon={IconHistory} />}
                    >
                        My query history
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
