import { Box } from '@mantine/core';
import { clsx } from 'clsx';
import { memo } from 'react';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import MantineBaseProvider from '../../providers/MantineBaseProvider';
import { getProjectUrlIdentifier } from '../../utils/projectUrl';
import { BANNER_HEIGHT, NAVBAR_HEIGHT } from '../common/Page/constants';
import { DashboardExplorerBanner } from './DashboardExplorerBanner';
import classes from './index.module.css';
import { MainNavBarContent } from './MainNavBarContent';
import { useNavBarBanner } from './useNavBarBanner';

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

const getNavBarRootElement = () =>
    document.getElementById('navbar-header') ?? undefined;

const NavBar = memo(({ isFixed = true }: NavBarProps) => {
    const { isFullscreen } = useFullscreen();
    const routeProjectUuid = useProjectUuid();

    const { activeProjectUuid, isLoading: isLoadingActiveProject } =
        useActiveProjectUuid({
            refetchOnMount: true,
            projectUuid: routeProjectUuid,
        });
    const { data: project } = useProject(activeProjectUuid);

    const { navBarMode } = useNavBarMode();
    const { hasBanner, banner } = useNavBarBanner(project, activeProjectUuid);

    // Calculate placeholder height: navbar + banner.
    const headerContainerHeight =
        NAVBAR_HEIGHT + (hasBanner ? BANNER_HEIGHT : 0);

    // Scoped dark theme for the navbar using Mantine's cssVariablesSelector + getRootElement.
    // This is the recommended approach for scoped theming, though it has known CSS specificity
    // limitations (see: https://github.com/orgs/mantinedev/discussions/4803).
    // The manual `data-mantine-color-scheme="dark"` attribute helps CSS selectors match correctly.
    return (
        <Box
            id="navbar-header"
            data-mantine-color-scheme="dark"
            data-has-visible-fixed-navbar={isFixed && !isFullscreen}
            data-has-banner={hasBanner}
        >
            <MantineBaseProvider
                forceColorScheme="dark"
                cssVariablesSelector="#navbar-header"
                getRootElement={getNavBarRootElement}
            >
                {banner}
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
                        activeProjectUrlIdentifier={
                            project
                                ? getProjectUrlIdentifier(project)
                                : activeProjectUuid
                        }
                        isLoadingActiveProject={isLoadingActiveProject}
                    />
                </Box>
                {/* Placeholder to reserve space when navbar is fixed */}
                {isFixed && !isFullscreen && <Box h={headerContainerHeight} />}
            </MantineBaseProvider>
        </Box>
    );
});

export default NavBar;
