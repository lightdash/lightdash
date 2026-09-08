import {
    ActionIcon,
    Box,
    Burger,
    Divider,
    Drawer,
    getDefaultZIndex,
    Group,
    Title,
} from '@mantine/core';
import {
    IconChartAreaLine,
    IconFolders,
    IconHome,
    IconLayoutDashboard,
    IconLogout,
} from '@tabler/icons-react';
import { lazy, Suspense, useCallback, useState, type FC } from 'react';
import { Link } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import useLogoutMutation from '../../hooks/user/useUserLogoutMutation';
import MantineBaseProvider from '../../providers/MantineBaseProvider';
import Logo from '../../svgs/logo-icon.svg?react';
import MantineIcon from '../common/MantineIcon';
import RouterNavLink from '../common/RouterNavLink';
import ProjectSwitcher from '../NavBar/ProjectSwitcher';
import { ThemeSwitcher } from '../NavBar/ThemeSwitcher';
import classes from './MobileNavBar.module.css';

const MobileAiAgentsNavLink = lazy(() => import('./MobileAiAgentsNavLink'));

const getMobileNavBarRootElement = () =>
    document.getElementById('mobile-navbar') ?? undefined;
export const MobileNavBar: FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const toggleMenu = useCallback(
        () => setIsMenuOpen((prevValue) => !prevValue),
        [],
    );
    const { activeProjectUuid } = useActiveProjectUuid({
        refetchOnMount: true,
    });
    const { mutate: logout } = useLogoutMutation({
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    return (
        <>
            {/* The header bar is always dark, like the desktop navbar. The
                drawer below stays outside this provider so it follows the
                app's colour scheme. */}
            <Box id="mobile-navbar" data-mantine-color-scheme="dark">
                <MantineBaseProvider
                    forceColorScheme="dark"
                    cssVariablesSelector="#mobile-navbar"
                    getRootElement={getMobileNavBarRootElement}
                >
                    <Box
                        component="header"
                        className={classes.header}
                        h={50}
                        mah={50}
                        display="flex"
                        px="md"
                        style={{ zIndex: getDefaultZIndex('app') }}
                    >
                        <Group align="center" justify="space-between" flex={1}>
                            <ActionIcon
                                component={Link}
                                to={'/'}
                                title="Home"
                                size="lg"
                            >
                                <Logo />
                            </ActionIcon>
                            <Burger
                                opened={isMenuOpen}
                                onClick={toggleMenu}
                                color="white"
                                aria-label={
                                    isMenuOpen
                                        ? 'Close navigation menu'
                                        : 'Open navigation menu'
                                }
                                aria-expanded={isMenuOpen}
                                aria-controls="mobile-navigation"
                            />
                        </Group>
                    </Box>
                </MantineBaseProvider>
            </Box>

            <Drawer
                id="mobile-navigation"
                title={<ThemeSwitcher />}
                opened={isMenuOpen}
                onClose={toggleMenu}
                size="75%"
            >
                <Title order={6} mb="xs">
                    Project
                </Title>
                <ProjectSwitcher portalTarget={null} />
                <Divider my="lg" />
                <RouterNavLink
                    exact
                    label="Home"
                    to={`/`}
                    leftSection={<MantineIcon icon={IconHome} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Spaces"
                    to={`/projects/${activeProjectUuid}/spaces`}
                    leftSection={<MantineIcon icon={IconFolders} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Dashboards"
                    to={`/projects/${activeProjectUuid}/dashboards`}
                    leftSection={<MantineIcon icon={IconLayoutDashboard} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Charts"
                    to={`/projects/${activeProjectUuid}/saved`}
                    leftSection={<MantineIcon icon={IconChartAreaLine} />}
                    onClick={toggleMenu}
                />
                {isMenuOpen && (
                    <Suspense fallback={null}>
                        <MobileAiAgentsNavLink
                            activeProjectUuid={activeProjectUuid}
                            onClick={toggleMenu}
                        />
                    </Suspense>
                )}
                <Divider my="lg" />

                <RouterNavLink
                    exact
                    label="Logout"
                    to={`/`}
                    leftSection={<MantineIcon icon={IconLogout} />}
                    onClick={() => logout()}
                />
            </Drawer>
        </>
    );
};
