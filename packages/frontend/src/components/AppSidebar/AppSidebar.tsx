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
import { Fragment, useRef, type FC } from 'react';
import { Link, useLocation } from 'react-router';
import { MobileSignInMenu } from '../../features/mobile/MobileSignInMenu';
import { MobileSignInOpenerContext } from '../../features/mobile/mobileSignInOpener';
import Omnibar from '../../features/omnibar';
import { useFavorites } from '../../hooks/favorites/useFavorites';
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
    getActiveFavoriteUuid,
} from './appSidebarNavigation';
import { SidebarCollapsedContext } from './SidebarCollapsedContext';
import { SidebarFavorites } from './SidebarFavorites';
import { SidebarLearnCard } from './SidebarLearnCard';
import { SidebarMenuTrigger } from './SidebarMenuTrigger';
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
    const mobileSignInOpener = useRef<(() => void) | null>(null);
    const footerRef = useRelocationAnimation<HTMLDivElement>(isCollapsed);
    const topRef = useRelocationAnimation<HTMLDivElement>(isCollapsed);
    const os = useOs();
    const searchShortcut = os === 'macos' || os === 'ios' ? '⌘K' : 'Ctrl K';
    const homeUrl = projectUrlIdentifier
        ? `/projects/${projectUrlIdentifier}/home`
        : '/';

    // The rail has no room beside the logo, so search stays a row there.
    const searchRow = projectUuid ? (
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
                        data-relocation-key="search"
                        leftSection={<MantineIcon icon={IconSearch} />}
                        rightSection={
                            <Text span className={classes.shortcut}>
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
    ) : null;

    return (
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
                            <NavBarLogo mark="ink" />
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
                        {!isCollapsed && projectUuid && (
                            <Omnibar
                                projectUuid={projectUuid}
                                renderTarget={(onOpen) => (
                                    <Tooltip
                                        label={`Search (${searchShortcut})`}
                                        position="bottom"
                                    >
                                        <UnstyledButton
                                            aria-label="Search content and settings"
                                            data-relocation-key="search"
                                            className={classes.searchTrigger}
                                            onClick={onOpen}
                                        >
                                            <MantineIcon icon={IconSearch} />
                                        </UnstyledButton>
                                    </Tooltip>
                                )}
                            />
                        )}
                    </Box>
                    {isCollapsed && searchRow}
                </Box>
                <Box className={classes.scroll}>
                    {sections.map((section) => {
                        const items = section.items.map((item) => ({
                            key: item.key,
                            isActive: item.key === activeItem,
                            animatesIn: false,
                            element: (
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
                                        rightSection={item.status}
                                        classNames={{
                                            root: classes.item,
                                            label: classes.itemLabel,
                                            section: classes.itemSection,
                                        }}
                                        active={item.key === activeItem}
                                        aria-current={
                                            item.key === activeItem
                                                ? 'page'
                                                : undefined
                                        }
                                        onClick={item.onClick ?? undefined}
                                        data-tour-nav={
                                            item.tourNav ?? undefined
                                        }
                                    />
                                </Tooltip>
                            ),
                        }));
                        return section.label === null ? (
                            <Fragment key={section.key}>
                                <Box>
                                    {items.map((item) => (
                                        <Fragment key={item.key}>
                                            {item.element}
                                        </Fragment>
                                    ))}
                                </Box>
                                {projectUuid && projectUrlIdentifier && (
                                    <SidebarFavorites
                                        projectUuid={projectUuid}
                                        projectUrlIdentifier={
                                            projectUrlIdentifier
                                        }
                                        isSidebarCollapsed={isCollapsed}
                                        activeFavoriteUuid={activeFavoriteUuid}
                                    />
                                )}
                            </Fragment>
                        ) : (
                            <SidebarSection
                                key={section.key}
                                sectionKey={section.key}
                                label={section.label}
                                isSidebarCollapsed={isCollapsed}
                                items={items}
                            />
                        );
                    })}
                </Box>
                <NavBarPortalContext.Provider value="body">
                    <NavMenuTriggerContext.Provider value={SidebarMenuTrigger}>
                        <MobileSignInOpenerContext.Provider
                            value={mobileSignInOpener}
                        >
                            <SidebarCollapsedContext.Provider
                                value={isCollapsed}
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
                                            sourceProjectUuid={
                                                projectUuid ?? null
                                            }
                                        />
                                        <UserMenu />
                                        {projectUuid && (
                                            <NotificationsMenu
                                                projectUuid={projectUuid}
                                            />
                                        )}
                                    </Box>
                                </Box>
                            </SidebarCollapsedContext.Provider>
                        </MobileSignInOpenerContext.Provider>
                    </NavMenuTriggerContext.Provider>
                </NavBarPortalContext.Provider>
            </Box>
        </AppShell.Navbar>
    );
};
