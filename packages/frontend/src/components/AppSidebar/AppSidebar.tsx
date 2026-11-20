import {
    ActionIcon,
    AppShell,
    Box,
    NavLink,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useLocation } from 'react-router';
import MantineIcon from '../common/MantineIcon';
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
    isAnimated: boolean;
    onToggle: () => void;
};

export const AppSidebar: FC<Props> = ({
    projectUuid,
    projectUrlIdentifier,
    isCollapsed,
    isAnimated,
    onToggle,
}) => {
    const { pathname } = useLocation();
    const activeItem = getActiveAppSidebarItem(pathname);
    const sections = useAppSidebarSections({
        projectUuid,
        projectUrlIdentifier,
    });
    const toggleLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

    return (
        <AppShell.Navbar
            id={APP_SIDEBAR_ID}
            aria-label="Main navigation"
            className={classes.sidebar}
            withBorder={false}
            data-collapsed={isCollapsed}
            data-animated={isAnimated}
        >
            <Box className={classes.content}>
                <Box className={classes.header}>
                    <ActionIcon
                        onClick={onToggle}
                        aria-label={toggleLabel}
                        aria-expanded={!isCollapsed}
                        aria-keyshortcuts="Control+B Meta+B"
                    >
                        <MantineIcon
                            icon={
                                isCollapsed
                                    ? IconLayoutSidebarLeftExpand
                                    : IconLayoutSidebarLeftCollapse
                            }
                        />
                    </ActionIcon>
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
