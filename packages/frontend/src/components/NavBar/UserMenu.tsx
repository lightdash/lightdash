import { Button, getDefaultZIndex, Menu } from '@mantine/core';
import {
    IconDeviceMobile,
    IconHistory,
    IconLogout,
    IconUserCircle,
    IconUserPlus,
} from '@tabler/icons-react';
import { useContext, type FC } from 'react';
import { Link } from 'react-router';
import { MobileSignInDisclosureContext } from '../../features/mobile/mobileSignInDisclosure';
import { MOBILE_STRINGS } from '../../features/mobile/mobileStrings';
import { useIsMobileSignInOffered } from '../../features/mobile/useIsMobileSignInOffered';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { UserAvatar } from '../UserAvatar';
import { useNavBarMenuProps } from './NavBarPortalContext';
import { useNavLayout, useNavTriggerMenuProps } from './NavLayoutContext';
import { ThemeSwitcherMenuItem } from './ThemeSwitcher';

const UserMenu: FC<{ withLabel?: boolean }> = ({ withLabel = false }) => {
    const menuProps = useNavBarMenuProps();
    const triggerMenuProps = useNavTriggerMenuProps();
    const { layout, Trigger } = useNavLayout();
    const isInSidebar = layout === 'sidebar';
    const mobileSignIn = useContext(MobileSignInDisclosureContext);
    const isMobileSignInOffered = useIsMobileSignInOffered();
    const { user } = useApp();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { mutate: logout } = useLogoutMutation({
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    return (
        <Menu
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            {...menuProps}
            {...triggerMenuProps}
        >
            <Menu.Target>
                {isInSidebar ? (
                    <Trigger
                        variant="row"
                        withLabel={withLabel}
                        icon={<UserAvatar size={20} />}
                        label={
                            [user.data?.firstName, user.data?.lastName]
                                .filter(Boolean)
                                .join(' ') || 'Account'
                        }
                        hasIndicator={false}
                        badge={null}
                    />
                ) : withLabel ? (
                    <Button variant="default" leftSection={<UserAvatar />}>
                        Account
                    </Button>
                ) : (
                    <UserAvatar />
                )}
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

                {activeProjectUuid ? (
                    <Menu.Item
                        role="menuitem"
                        component={Link}
                        to={`/projects/${activeProjectUuid}/query-history`}
                        leftSection={<MantineIcon icon={IconHistory} />}
                    >
                        My query history
                    </Menu.Item>
                ) : null}

                {mobileSignIn && isMobileSignInOffered ? (
                    <Menu.Item
                        role="menuitem"
                        onClick={() => mobileSignIn.setOpened(true)}
                        leftSection={<MantineIcon icon={IconDeviceMobile} />}
                    >
                        {MOBILE_STRINGS.signInTitle}
                    </Menu.Item>
                ) : null}

                {isInSidebar && <Menu.Divider />}

                <Menu.Item
                    role="menuitem"
                    onClick={() => logout()}
                    leftSection={<MantineIcon icon={IconLogout} />}
                >
                    {isInSidebar ? 'Log out' : 'Logout'}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

export default UserMenu;
