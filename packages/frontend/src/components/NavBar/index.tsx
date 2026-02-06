import { ProjectType } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { memo } from 'react';
import { useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import { useImpersonation } from '../../hooks/user/useImpersonation';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import Mantine8Provider from '../../providers/Mantine8Provider';
import { BANNER_HEIGHT, NAVBAR_HEIGHT } from '../common/Page/constants';
import { DashboardExplorerBanner } from './DashboardExplorerBanner';
import { ImpersonationBanner } from './ImpersonationBanner';
import { MainNavBarContent } from './MainNavBarContent';
import { PreviewBanner } from './PreviewBanner';
import classes from './index.module.css';

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
    isLoadingActiveProject,
}: {
    navBarMode: NavBarMode;
    activeProjectUuid: string | undefined;
    isLoadingActiveProject: boolean;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    if (navBarMode === NavBarMode.EDITING_DASHBOARD_CHART) {
        return <DashboardExplorerBanner projectUuid={projectUuid} />;
    }

    return (
        <MainNavBarContent
            activeProjectUuid={activeProjectUuid}
            isLoadingActiveProject={isLoadingActiveProject}
        />
    );
};

const NavBar = memo(({ isFixed = true }: NavBarProps) => {
    const { isFullscreen } = useFullscreen();

    const { activeProjectUuid, isLoading: isLoadingActiveProject } =
        useActiveProjectUuid({ refetchOnMount: true });
    const { data: project } = useProject(activeProjectUuid);

    const isCurrentProjectPreview = project?.type === ProjectType.PREVIEW;
    const { isImpersonating } = useImpersonation();

    const { navBarMode } = useNavBarMode();

    const hasBanner = isImpersonating || isCurrentProjectPreview;

    // Calculate placeholder height: navbar + banner (if preview or impersonating)
    const headerContainerHeight =
        NAVBAR_HEIGHT + (hasBanner ? BANNER_HEIGHT : 0);

    // Scoped dark theme for the navbar using Mantine 8's cssVariablesSelector + getRootElement.
    // This is the recommended approach for scoped theming, though it has known CSS specificity
    // limitations (see: https://github.com/orgs/mantinedev/discussions/4803).
    // The manual `data-mantine-color-scheme="dark"` attribute helps CSS selectors match correctly.
    return (
        <Box id="navbar-header" data-mantine-color-scheme="dark">
            <Mantine8Provider
                forceColorScheme="dark"
                cssVariablesSelector="#navbar-header"
                getRootElement={() =>
                    document.getElementById('navbar-header') ?? undefined
                }
            >
                {isImpersonating ? (
                    <ImpersonationBanner />
                ) : (
                    isCurrentProjectPreview && <PreviewBanner />
                )}
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
                        isLoadingActiveProject={isLoadingActiveProject}
                    />
                </Box>
                {/* Placeholder to reserve space when navbar is fixed */}
                {isFixed && !isFullscreen && <Box h={headerContainerHeight} />}
            </Mantine8Provider>
        </Box>
    );
});

export default NavBar;
