import { FeatureFlags } from '@lightdash/common';
import { AppShell } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import { APP_SIDEBAR_WIDTH, BANNER_HEIGHT } from '../common/Page/constants';
import NavBar from '../NavBar';
import { NavBarRoot } from '../NavBar/NavBarRoot';
import { SharedSignInExpiryListener } from '../NavBar/SharedSignInExpiryListener';
import { useCompactNavigation } from '../NavBar/useCompactNavigation';
import { useNavBarState } from '../NavBar/useNavBarState';
import { AppSidebar } from './AppSidebar';
import classes from './AppSidebar.module.css';

const SidebarShell: FC<{ children: ReactNode }> = ({ children }) => {
    const { isFullscreen } = useFullscreen();
    const {
        activeProjectUuid,
        projectUrlIdentifier,
        isLoadingActiveProject,
        hasBanner,
        banner,
    } = useNavBarState();

    return (
        <AppShell
            className={classes.shell}
            // The sidebar never turns into Mantine's full-width mobile
            // navbar: phone-width windows keep the top navbar.
            navbar={{
                width: APP_SIDEBAR_WIDTH,
                breakpoint: 0,
                collapsed: { desktop: isFullscreen, mobile: isFullscreen },
            }}
            header={{ height: hasBanner ? BANNER_HEIGHT : 0 }}
            // Animating the offset would re-measure every chart on each frame.
            transitionDuration={0}
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
