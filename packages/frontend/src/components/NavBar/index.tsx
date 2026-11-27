import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import { memo } from 'react';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import { BANNER_HEIGHT, NAVBAR_HEIGHT } from '../common/Page/constants';
import { DashboardExplorerBanner } from './DashboardExplorerBanner';
import classes from './index.module.css';
import { MainNavBarContent } from './MainNavBarContent';
import { NavBarRoot } from './NavBarRoot';
import { useNavBarState } from './useNavBarState';
import { WorkspaceBanner } from './WorkspaceBanner';

enum NavBarMode {
    DEFAULT = 'default',
    EDITING_DASHBOARD_CHART = 'editingDashboardChart',
}

const useNavBarMode = () => {
    const { isEditingDashboardChart } = useDashboardStorage();

    return {
        navBarMode: isEditingDashboardChart
            ? NavBarMode.EDITING_DASHBOARD_CHART
            : NavBarMode.DEFAULT,
    };
};

interface NavBarProps {
    isFixed?: boolean;
}

const NavBarContent = ({
    navBarMode,
    activeProjectUuid,
    activeProjectUrlIdentifier,
    isLoadingActiveProject,
}: {
    navBarMode: NavBarMode;
    activeProjectUuid: string | undefined;
    activeProjectUrlIdentifier: string | undefined;
    isLoadingActiveProject: boolean;
}) => {
    const projectUuid = useProjectUuid();
    if (navBarMode === NavBarMode.EDITING_DASHBOARD_CHART) {
        return <DashboardExplorerBanner projectUuid={projectUuid} />;
    }

    return (
        <MainNavBarContent
            activeProjectUuid={activeProjectUuid}
            activeProjectUrlIdentifier={activeProjectUrlIdentifier}
            isLoadingActiveProject={isLoadingActiveProject}
        />
    );
};

const NavBar = memo(({ isFixed = true }: NavBarProps) => {
    const { isFullscreen } = useFullscreen();
    const {
        activeProjectUuid,
        projectUrlIdentifier,
        isLoadingActiveProject,
        isImpersonating,
        notice,
        organizationAccess,
    } = useNavBarState();
    const hasBanner = isImpersonating || notice !== null;
    const { navBarMode } = useNavBarMode();

    // Calculate placeholder height: navbar + banner.
    const headerContainerHeight =
        NAVBAR_HEIGHT + (hasBanner ? BANNER_HEIGHT : 0);

    return (
        <NavBarRoot
            hasVisibleFixedNavbar={isFixed && !isFullscreen}
            hasBanner={hasBanner}
        >
            <WorkspaceBanner
                isImpersonating={isImpersonating}
                notice={notice}
                organizationAccess={organizationAccess}
            />
            <Box
                component="header"
                h={NAVBAR_HEIGHT}
                className={clsx(
                    classes.header,
                    isFixed && classes.fixed,
                    navBarMode === NavBarMode.EDITING_DASHBOARD_CHART &&
                        classes.headerEditingDashboardChart,
                )}
                mt={hasBanner ? BANNER_HEIGHT : 0}
                display={isFullscreen ? 'none' : 'flex'}
                px="md"
            >
                <NavBarContent
                    navBarMode={navBarMode}
                    activeProjectUuid={activeProjectUuid}
                    activeProjectUrlIdentifier={projectUrlIdentifier}
                    isLoadingActiveProject={isLoadingActiveProject}
                />
            </Box>
            {/* Placeholder to reserve space when navbar is fixed */}
            {isFixed && !isFullscreen && <Box h={headerContainerHeight} />}
        </NavBarRoot>
    );
});

export default NavBar;
