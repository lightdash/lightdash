import { assertUnreachable, ProjectType } from '@lightdash/common';
import {
    Box,
    getDefaultZIndex,
    Header,
    MantineProvider,
    type MantineTheme,
} from '@mantine/core';
import { memo, useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import { getMantineThemeOverride } from '../../mantineTheme';
import useFullscreen from '../../providers/Fullscreen/useFullscreen';
import { BANNER_HEIGHT, NAVBAR_HEIGHT } from '../common/Page/constants';
import { DashboardExplorerBanner } from './DashboardExplorerBanner';
import { MainNavBarContent } from './MainNavBarContent';
import { PreviewBanner } from './PreviewBanner';

enum NavBarMode {
    DEFAULT = 'default',
    EDITING_DASHBOARD_CHART = 'editingDashboardChart',
}

const defaultNavbarStyles = {
    alignItems: 'center',
    boxShadow: 'lg',
    justifyContent: 'flex-start',
};

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

const NavBar = memo(({ isFixed = true }: NavBarProps) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isFullscreen } = useFullscreen();

    const { navBarMode } = useNavBarMode();

    // Force dark theme for navbar (excluding global styles)
    const darkTheme = useMemo(() => {
        const fullDarkTheme = getMantineThemeOverride('dark');
        const { globalStyles, ...themeWithoutGlobalStyles } = fullDarkTheme;
        return themeWithoutGlobalStyles;
    }, []);
    const { activeProjectUuid, isLoading: isLoadingActiveProject } =
        useActiveProjectUuid({ refetchOnMount: true });

    const { data: project } = useProject(activeProjectUuid);

    const isCurrentProjectPreview = project?.type === ProjectType.PREVIEW;

    // Calculate placeholder height: navbar + banner (if preview project)
    const headerContainerHeight =
        NAVBAR_HEIGHT + (isCurrentProjectPreview ? BANNER_HEIGHT : 0);

    const getHeaderStyles = useCallback(
        (theme: MantineTheme) => ({
            ...defaultNavbarStyles,
            ...(navBarMode === NavBarMode.EDITING_DASHBOARD_CHART && {
                justifyContent: 'center',
                borderBottom: 'none',
                backgroundColor: theme.colors.blue['6'],
                color: 'white',
            }),
        }),
        [navBarMode],
    );

    const renderNavBarContent = () => {
        switch (navBarMode) {
            case NavBarMode.EDITING_DASHBOARD_CHART:
                return <DashboardExplorerBanner projectUuid={projectUuid} />;
            case NavBarMode.DEFAULT:
                return (
                    <MainNavBarContent
                        activeProjectUuid={activeProjectUuid}
                        isLoadingActiveProject={isLoadingActiveProject}
                    />
                );
            default:
                assertUnreachable(
                    navBarMode,
                    `Unknown navBarMode ${navBarMode}`,
                );
        }
    };

    return (
        <MantineProvider theme={darkTheme}>
            {isCurrentProjectPreview && <PreviewBanner />}
            <Header
                height={NAVBAR_HEIGHT}
                fixed={isFixed}
                mt={isCurrentProjectPreview ? BANNER_HEIGHT : 0}
                display={isFullscreen ? 'none' : 'flex'}
                px="md"
                zIndex={isFixed ? getDefaultZIndex('app') : undefined}
                styles={(theme) => ({ root: getHeaderStyles(theme) })}
            >
                {renderNavBarContent()}
            </Header>
            {/* Placeholder to reserve space when navbar is fixed */}
            {isFixed && !isFullscreen && <Box h={headerContainerHeight} />}
        </MantineProvider>
    );
});

export default NavBar;
