import {
    AppShell,
    Box,
    NavLink,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useLocation } from 'react-router';
import Omnibar from '../../features/omnibar';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import HeadwayMenuItem from '../NavBar/HeadwayMenuItem';
import HelpMenu from '../NavBar/HelpMenu';
import { NavBarLogo } from '../NavBar/NavBarLogo';
import { NavBarPortalContext } from '../NavBar/NavBarPortalContext';
import { NavMenuTriggerContext } from '../NavBar/NavMenuTriggerContext';
import { NotificationsMenu } from '../NavBar/NotificationsMenu';
import ProjectCredentialsSwitcher from '../NavBar/ProjectCredentialsSwitcher';
import ProjectSwitcher from '../NavBar/ProjectSwitcher';
import SettingsMenu from '../NavBar/SettingsMenu';
import UserMenu from '../NavBar/UserMenu';
import classes from './AppSidebar.module.css';
import {
    APP_SIDEBAR_ID,
    getActiveAppSidebarItem,
} from './appSidebarNavigation';
import { SidebarCollapsedContext } from './SidebarCollapsedContext';
import { SidebarMenuTrigger } from './SidebarMenuTrigger';
import { useAppSidebarSections } from './useAppSidebarSections';

type Props = {
    projectUuid: string | undefined;
    projectUrlIdentifier: string | undefined;
    isCollapsed: boolean;
};

export const AppSidebar: FC<Props> = ({
    projectUuid,
    projectUrlIdentifier,
    isCollapsed,
}) => {
    const { pathname } = useLocation();
    const activeItem = getActiveAppSidebarItem(pathname);
    const sections = useAppSidebarSections({
        projectUuid,
        projectUrlIdentifier,
    });
    const { health } = useApp();
    const isHeadwayEnabled = health.data?.headway?.enabled === true;
    const os = useOs();
    const searchShortcut = os === 'macos' || os === 'ios' ? '⌘K' : 'Ctrl K';
    const homeUrl = projectUrlIdentifier
        ? `/projects/${projectUrlIdentifier}/home`
        : '/';

    return (
        <AppShell.Navbar
            id={APP_SIDEBAR_ID}
            aria-label="Main navigation"
            className={classes.sidebar}
            withBorder={false}
            data-collapsed={isCollapsed}
        >
            <Box className={classes.content}>
                <Box className={classes.top}>
                    <Box className={classes.header}>
                        <UnstyledButton
                            component={Link}
                            to={homeUrl}
                            aria-label="Home"
                            className={classes.logo}
                        >
                            <NavBarLogo />
                        </UnstyledButton>
                        {!isCollapsed && (
                            <ProjectSwitcher
                                layout="sidebar"
                                portalTarget={null}
                            />
                        )}
                        {/* The top navbar's forced-dark subtree is not on screen
                        here, so its menus open on the page instead. */}
                        <NavBarPortalContext.Provider value="body">
                            <ProjectCredentialsSwitcher />
                        </NavBarPortalContext.Provider>
                    </Box>
                    {projectUuid && (
                        <Omnibar
                            projectUuid={projectUuid}
                            renderTarget={(onOpen) => (
                                <Tooltip
                                    label={`Search (${searchShortcut})`}
                                    position="right"
                                    disabled={!isCollapsed}
                                >
                                    <NavLink
                                        component="button"
                                        type="button"
                                        label="Search"
                                        aria-label="Search content and settings"
                                        leftSection={
                                            <MantineIcon icon={IconSearch} />
                                        }
                                        rightSection={
                                            <Text
                                                span
                                                className={classes.shortcut}
                                            >
                                                {searchShortcut}
                                            </Text>
                                        }
                                        classNames={{
                                            root: classes.item,
                                            label: classes.itemLabel,
                                            section: classes.itemSection,
                                        }}
                                        onClick={onOpen}
                                    />
                                </Tooltip>
                            )}
                        />
                    )}
                </Box>
                {sections.map((section) => (
                    <Box key={section.key}>
                        {section.label !== null && (
                            <Text className={classes.sectionLabel}>
                                {section.label}
                            </Text>
                        )}
                        {section.items.map((item) => (
                            <Tooltip
                                key={item.key}
                                label={item.label}
                                position="right"
                                disabled={!isCollapsed}
                            >
                                <NavLink
                                    component={Link}
                                    to={item.to}
                                    label={item.label}
                                    leftSection={item.icon}
                                    classNames={{
                                        root: classes.item,
                                        label: classes.itemLabel,
                                    }}
                                    active={item.key === activeItem}
                                    aria-current={
                                        item.key === activeItem
                                            ? 'page'
                                            : undefined
                                    }
                                    onClick={item.onClick ?? undefined}
                                />
                            </Tooltip>
                        ))}
                    </Box>
                ))}
                <NavBarPortalContext.Provider value="body">
                    <NavMenuTriggerContext.Provider value={SidebarMenuTrigger}>
                        <SidebarCollapsedContext.Provider value={isCollapsed}>
                            <Box className={classes.footer}>
                                <SettingsMenu />
                                <HelpMenu />
                                {isHeadwayEnabled && projectUuid && (
                                    <HeadwayMenuItem
                                        projectUuid={projectUuid}
                                    />
                                )}
                                <Box className={classes.account}>
                                    <UserMenu />
                                    {projectUuid && (
                                        <NotificationsMenu
                                            projectUuid={projectUuid}
                                        />
                                    )}
                                </Box>
                            </Box>
                        </SidebarCollapsedContext.Provider>
                    </NavMenuTriggerContext.Provider>
                </NavBarPortalContext.Provider>
            </Box>
        </AppShell.Navbar>
    );
};
