import { FeatureFlags } from '@lightdash/common';
import { AppShell, useAppShellResize } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { clamp } from 'es-toolkit/compat';
import { type FC, type ReactNode } from 'react';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import {
    APP_SIDEBAR_COLLAPSE_THRESHOLD,
    APP_SIDEBAR_MAX_WIDTH,
    APP_SIDEBAR_MIN_WIDTH,
    APP_SIDEBAR_RAIL_WIDTH,
    APP_SIDEBAR_WIDTH,
    BANNER_HEIGHT,
} from '../common/Page/constants';
import NavBar from '../NavBar';
import { NavBarRoot } from '../NavBar/NavBarRoot';
import { SharedSignInExpiryListener } from '../NavBar/SharedSignInExpiryListener';
import { useCompactNavigation } from '../NavBar/useCompactNavigation';
import { useNavBarState } from '../NavBar/useNavBarState';
import { AppSidebar } from './AppSidebar';
import classes from './AppSidebar.module.css';
import { APP_SIDEBAR_ID } from './appSidebarNavigation';
import { useAppSidebarCollapse } from './useAppSidebarCollapse';

const APP_SIDEBAR_WIDTH_STORAGE_KEY = 'app-sidebar:width';

const APP_SIDEBAR_RESIZE_OPTIONS = {
    min: APP_SIDEBAR_MIN_WIDTH,
    max: APP_SIDEBAR_MAX_WIDTH,
    collapseThreshold: APP_SIDEBAR_COLLAPSE_THRESHOLD,
    label: 'Resize sidebar',
};

// A drag leaves the resize edge focused, and the next key press would then
// show its focus line until something else takes focus.
const blurResizeEdge = () => {
    const focused = document.activeElement;
    if (
        focused instanceof HTMLElement &&
        focused.getAttribute('role') === 'separator' &&
        focused.closest(`#${APP_SIDEBAR_ID}`) !== null
    ) {
        focused.blur();
    }
};

const SidebarShell: FC<{ children: ReactNode }> = ({ children }) => {
    const { isFullscreen } = useFullscreen();
    const {
        activeProjectUuid,
        projectUrlIdentifier,
        isLoadingActiveProject,
        hasBanner,
        banner,
    } = useNavBarState();
    const {
        isCollapsed,
        isAnimated,
        toggleWithPointer,
        setCollapsedInstantly,
    } = useAppSidebarCollapse();
    const [storedWidth, setStoredWidth] = useLocalStorage<number>({
        key: APP_SIDEBAR_WIDTH_STORAGE_KEY,
        defaultValue: APP_SIDEBAR_WIDTH,
        getInitialValueInEffect: false,
    });
    const expandedWidth = clamp(
        storedWidth,
        APP_SIDEBAR_MIN_WIDTH,
        APP_SIDEBAR_MAX_WIDTH,
    );
    const resize = useAppShellResize({
        navbar: APP_SIDEBAR_RESIZE_OPTIONS,
        onResizeEnd: ({ navbar }) => {
            // A drag that ends in the rail keeps the last expanded width.
            if (navbar !== undefined && !isCollapsed) setStoredWidth(navbar);
            // The width lives in storage; a size kept by the controller
            // would override the rail's.
            resize.navbar.reset();
        },
        onCollapseChange: (section, collapsed) => {
            if (section === 'navbar') setCollapsedInstantly(collapsed);
        },
    });

    return (
        <AppShell
            className={classes.shell}
            data-left-navigation
            data-sidebar-collapsed={isCollapsed}
            data-rounded-page={!isFullscreen}
            onPointerUpCapture={blurResizeEdge}
            classNames={{ resizeHandle: classes.resizeHandle }}
            // The sidebar never turns into Mantine's full-width mobile
            // navbar: phone-width windows keep the top navbar.
            navbar={{
                width: isCollapsed ? APP_SIDEBAR_RAIL_WIDTH : expandedWidth,
                breakpoint: 0,
                collapsed: { desktop: isFullscreen, mobile: isFullscreen },
            }}
            header={{ height: hasBanner ? BANNER_HEIGHT : 0 }}
            // Animating the offset would re-measure every chart on each frame.
            transitionDuration={0}
            resize={resize}
        >
            <AppShell.Header withBorder={false}>
                <NavBarRoot hasVisibleFixedNavbar={false} hasBanner={hasBanner}>
                    {banner}
                    <SharedSignInExpiryListener />
                </NavBarRoot>
            </AppShell.Header>
            <AppSidebar
                projectUuid={
                    isLoadingActiveProject ? undefined : activeProjectUuid
                }
                projectUrlIdentifier={projectUrlIdentifier}
                isCollapsed={isCollapsed}
                isAnimated={isAnimated}
                onToggle={toggleWithPointer}
            />
            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
};

type Props = {
    isNavBarFixed: boolean;
    children: ReactNode;
};

export const AppNavigationShell: FC<Props> = ({ isNavBarFixed, children }) => {
    const leftNavigationFlag = useServerFeatureFlag(
        FeatureFlags.LeftNavigation,
    );
    const isCompact = useCompactNavigation();
    const { isEditingDashboardChart } = useDashboardStorage();
    // Phones keep the top navbar, and so does editing a dashboard chart: its
    // bar holds the way back to the dashboard.
    const showSidebar =
        leftNavigationFlag.data?.enabled === true &&
        !isCompact &&
        !isEditingDashboardChart;

    if (showSidebar) return <SidebarShell>{children}</SidebarShell>;

    return (
        <>
            <NavBar isFixed={isNavBarFixed} />
            {children}
        </>
    );
};
