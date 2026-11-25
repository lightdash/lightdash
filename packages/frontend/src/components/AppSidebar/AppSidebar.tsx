import { AppShell, Box, NavLink, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link, useLocation } from 'react-router';
import classes from './AppSidebar.module.css';
import { getActiveAppSidebarItem } from './appSidebarNavigation';
import { useAppSidebarSections } from './useAppSidebarSections';

type Props = {
    projectUuid: string | undefined;
    projectUrlIdentifier: string | undefined;
};

export const AppSidebar: FC<Props> = ({
    projectUuid,
    projectUrlIdentifier,
}) => {
    const { pathname } = useLocation();
    const activeItem = getActiveAppSidebarItem(pathname);
    const sections = useAppSidebarSections({
        projectUuid,
        projectUrlIdentifier,
    });

    return (
        <AppShell.Navbar
            id="app-sidebar"
            aria-label="Main navigation"
            className={classes.sidebar}
        >
            {sections.map((section) => (
                <Box key={section.key}>
                    {section.label !== null && (
                        <Text className={classes.sectionLabel}>
                            {section.label}
                        </Text>
                    )}
                    {section.items.map((item) => (
                        <NavLink
                            key={item.key}
                            component={Link}
                            to={item.to}
                            label={item.label}
                            leftSection={item.icon}
                            active={item.key === activeItem}
                            aria-current={
                                item.key === activeItem ? 'page' : undefined
                            }
                            onClick={item.onClick ?? undefined}
                        />
                    ))}
                </Box>
            ))}
        </AppShell.Navbar>
    );
};
