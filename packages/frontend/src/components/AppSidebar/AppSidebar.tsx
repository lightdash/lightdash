import { AppShell, Box, Tooltip, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { Fragment, useMemo, useState, type FC } from 'react';
import { Link, useLocation } from 'react-router';
import { MobileSignInDisclosureContext } from '../../features/mobile/mobileSignInDisclosure';
import { MobileSignInMenu } from '../../features/mobile/MobileSignInMenu';
import Omnibar from '../../features/omnibar';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import useApp from '../../providers/App/useApp';
import { useModKeyLabel } from '../common/Dashboard/useShortcutHints';
import MantineIcon from '../common/MantineIcon';
import { getActiveFavoriteUuid } from '../NavBar/favoriteItems';
import HeadwayMenuItem from '../NavBar/HeadwayMenuItem';
import HelpMenu from '../NavBar/HelpMenu';
import { NavBarLogo } from '../NavBar/NavBarLogo';
import { NavBarPortalContext } from '../NavBar/NavBarPortalContext';
import { NavLayoutContext } from '../NavBar/NavLayoutContext';
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
import { SidebarFavorites } from './SidebarFavorites';
import { SidebarLearnCard } from './SidebarLearnCard';
import { SidebarMenuTrigger } from './SidebarMenuTrigger';
import { SidebarNavLink } from './SidebarNavLink';
import { SidebarSection } from './SidebarSection';
import { useAppSidebarSections } from './useAppSidebarSections';
import { useRelocationAnimation } from './useRelocationAnimation';

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
    const { data: favorites } = useFavorites(projectUuid);
    const activeFavoriteUuid = getActiveFavoriteUuid(pathname, favorites ?? []);
    // A favorite names the page more precisely than the list it belongs to.
    // The rail hides favorites, so there the list keeps the highlight.
    const activeItem =
        activeFavoriteUuid === null || isCollapsed
            ? getActiveAppSidebarItem(pathname)
            : null;
    const sections = useAppSidebarSections({
        projectUuid,
        projectUrlIdentifier,
    });
    const { health } = useApp();
    const isHeadwayEnabled = health.data?.headway?.enabled === true;
    const footerRef = useRelocationAnimation<HTMLDivElement>(isCollapsed);
    const topRef = useRelocationAnimation<HTMLDivElement>(isCollapsed);
    const modKey = useModKeyLabel();
    const searchShortcut = modKey === '⌘' ? '⌘K' : `${modKey} K`;
    const homeUrl = projectUrlIdentifier
        ? `/projects/${projectUrlIdentifier}/home`
        : '/';

    const navLayout = useMemo(
        () => ({
            layout: 'sidebar' as const,
            isCollapsed,
            Trigger: SidebarMenuTrigger,
        }),
        [isCollapsed],
    );
    const [isMobileSignInOpen, setIsMobileSignInOpen] = useState(false);
    const mobileSignIn = useMemo(
        () => ({
            opened: isMobileSignInOpen,
            setOpened: setIsMobileSignInOpen,
        }),
        [isMobileSignInOpen],
    );

    return (
        // The top navbar's forced-dark subtree is not on screen here, so
        // every menu opens on the page instead.
        <NavBarPortalContext.Provider value="body">
            <NavLayoutContext.Provider value={navLayout}>
                <AppShell.Navbar
                    id={APP_SIDEBAR_ID}
                    aria-label="Main navigation"
                    className={classes.sidebar}
                    withBorder={false}
                    data-collapsed={isCollapsed}
                >
                    <Box className={classes.content}>
                        <Box ref={topRef} className={classes.top}>
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
                                    <ProjectSwitcher portalTarget={null} />
                                )}
                                <ProjectCredentialsSwitcher />
                                {projectUuid && (
                                    <Omnibar
                                        projectUuid={projectUuid}
                                        // The rail has no room beside the logo, so
                                        // search is a row there.
                                        renderTarget={(onOpen) =>
                                            isCollapsed ? (
                                                <SidebarNavLink
                                                    component="button"
                                                    type="button"
                                                    tooltip={`Search (${searchShortcut})`}
                                                    isTooltipShown
                                                    isActive={false}
                                                    label="Search"
                                                    aria-label="Search content and settings"
                                                    data-relocation-key="search"
                                                    className={
                                                        classes.searchRow
                                                    }
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconSearch}
                                                        />
                                                    }
                                                    onClick={onOpen}
                                                />
                                            ) : (
                                                <Tooltip
                                                    label={`Search (${searchShortcut})`}
                                                    position="bottom"
                                                >
                                                    <UnstyledButton
                                                        aria-label="Search content and settings"
                                                        data-relocation-key="search"
                                                        className={
                                                            classes.searchTrigger
                                                        }
                                                        onClick={onOpen}
                                                    >
                                                        <MantineIcon
                                                            icon={IconSearch}
                                                        />
                                                    </UnstyledButton>
                                                </Tooltip>
                                            )
                                        }
                                    />
                                )}
                            </Box>
                        </Box>
                        <Box className={classes.scroll}>
                            {sections.map((section) => (
                                <Fragment key={section.key}>
                                    <SidebarSection
                                        sectionKey={section.key}
                                        label={section.label}
                                        isSidebarCollapsed={isCollapsed}
                                        items={section.items.map((item) => ({
                                            key: item.key,
                                            isActive: item.key === activeItem,
                                            animatesIn: false,
                                            element: (
                                                <SidebarNavLink
                                                    component={Link}
                                                    to={item.to}
                                                    tooltip={item.label}
                                                    isTooltipShown={isCollapsed}
                                                    isActive={
                                                        item.key === activeItem
                                                    }
                                                    label={item.label}
                                                    leftSection={item.icon}
                                                    rightSection={item.status}
                                                    onClick={
                                                        item.onClick ??
                                                        undefined
                                                    }
                                                    data-tour-nav={item.tourNav}
                                                />
                                            ),
                                        }))}
                                    />
                                    {section.key === 'main' &&
                                        projectUuid &&
                                        projectUrlIdentifier && (
                                            <SidebarFavorites
                                                favorites={favorites}
                                                projectUuid={projectUuid}
                                                projectUrlIdentifier={
                                                    projectUrlIdentifier
                                                }
                                                isSidebarCollapsed={isCollapsed}
                                                activeFavoriteUuid={
                                                    activeFavoriteUuid
                                                }
                                            />
                                        )}
                                </Fragment>
                            ))}
                        </Box>
                        <MobileSignInDisclosureContext.Provider
                            value={mobileSignIn}
                        >
                            <Box ref={footerRef} className={classes.footer}>
                                {projectUuid && (
                                    <SidebarLearnCard
                                        projectUuid={projectUuid}
                                        isSidebarCollapsed={isCollapsed}
                                    />
                                )}
                                <SettingsMenu />
                                <HelpMenu />
                                {isHeadwayEnabled && projectUuid && (
                                    <HeadwayMenuItem
                                        projectUuid={projectUuid}
                                    />
                                )}
                                <Box className={classes.account}>
                                    <MobileSignInMenu
                                        sourceProjectUuid={projectUuid ?? null}
                                    />
                                    <UserMenu />
                                    {projectUuid && (
                                        <NotificationsMenu
                                            projectUuid={projectUuid}
                                        />
                                    )}
                                </Box>
                            </Box>
                        </MobileSignInDisclosureContext.Provider>
                    </Box>
                </AppShell.Navbar>
            </NavLayoutContext.Provider>
        </NavBarPortalContext.Provider>
    );
};
