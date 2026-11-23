import {
    AppShell,
    Box,
    NavLink,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { type FC } from 'react';
import { Link, useLocation } from 'react-router';
import { NavBarLogo } from '../NavBar/NavBarLogo';
import { NavBarPortalContext } from '../NavBar/NavBarPortalContext';
import ProjectCredentialsSwitcher from '../NavBar/ProjectCredentialsSwitcher';
import ProjectSwitcher from '../NavBar/ProjectSwitcher';
import classes from './AppSidebar.module.css';
import {
    APP_SIDEBAR_ID,
    getActiveAppSidebarItem,
} from './appSidebarNavigation';
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
                        <ProjectSwitcher layout="sidebar" portalTarget={null} />
                    )}
                    {/* The top navbar's forced-dark subtree is not on screen
                        here, so its menus open on the page instead. */}
                    <NavBarPortalContext.Provider value="body">
                        <ProjectCredentialsSwitcher />
                    </NavBarPortalContext.Provider>
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
            </Box>
        </AppShell.Navbar>
    );
};
