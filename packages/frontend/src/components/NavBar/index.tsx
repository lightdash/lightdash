import { ProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    Divider,
    getDefaultZIndex,
    Group,
    Header,
    MantineProvider,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconTool } from '@tabler/icons-react';
import { PostHogFeature } from 'posthog-js/react';
import { FC, memo, useEffect, useMemo } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useActiveProject } from '../../hooks/useActiveProject';
import { ReactComponent as Logo } from '../../svgs/logo-icon.svg';
import MantineIcon from '../common/MantineIcon';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import GlobalSearch from './GlobalSearch';
import HeadwayMenuItem from './HeadwayMenuItem';
import HelpMenu from './HelpMenu';
import { NotificationsMenu } from './NotificationsMenu';
import ProjectSwitcher from './ProjectSwitcher';
import SettingsMenu from './SettingsMenu';
import UserMenu from './UserMenu';

export const BANNER_HEIGHT = 35;
export const NAVBAR_HEIGHT = 50;

const Banner: FC = ({ children }) => (
    <Center
        pos="fixed"
        w="100%"
        h={BANNER_HEIGHT}
        bg="blue.6"
        sx={{ zIndex: getDefaultZIndex('app') }}
    >
        {children}
    </Center>
);

const PreviewBanner = () => (
    <Banner>
        <MantineIcon icon={IconTool} color="white" size="sm" />
        <Text color="white" fw={500} fz="xs" mx="xxs">
            This is a preview environment. Any changes you make here will not
            affect production.
        </Text>
    </Banner>
);

const DashboardExplorerBanner: FC<{
    dashboardName: string;
    projectUuid: string;
    dashboardUuid: string;
}> = ({ dashboardName, projectUuid, dashboardUuid }) => {
    const history = useHistory();
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: string;
    }>();

    const action = useMemo(() => {
        if (!savedQueryUuid) {
            return 'creating';
        }
        switch (mode) {
            case 'edit':
                return 'editing';
            case 'view':
                return 'viewing';
            default:
                return 'viewing';
        }
    }, [savedQueryUuid, mode]);

    return (
        <Banner>
            <MantineIcon icon={IconInfoCircle} color="white" size="sm" />
            <Text color="white" fw={500} fz="xs" mx="xxs">
                You are {action} this chart from within "{dashboardName}"
            </Text>
            <Tooltip
                withinPortal
                label="Cancel chart creation and return to dashboard"
                position="bottom"
                maw={350}
            >
                <Button
                    onClick={() => {
                        history.push(
                            `/projects/${projectUuid}/dashboards/${dashboardUuid}/${
                                savedQueryUuid ? 'view' : 'edit'
                            }`,
                        );
                    }}
                    size="xs"
                    ml="md"
                    variant="white"
                    compact
                >
                    Cancel
                </Button>
            </Tooltip>
        </Banner>
    );
};

const NavBar = memo(() => {
    const { activeProject, isLoading: isLoadingActiveProject } =
        useActiveProject({ refetchOnMount: true });

    const {
        getIsEditingDashboardChart,
        getEditingDashboardInfo,
        clearDashboardStorage,
    } = useDashboardStorage();

    const dashboardInfo = getEditingDashboardInfo();

    const homeUrl = activeProject
        ? `/projects/${activeProject.projectUuid}/home`
        : '/';

    const isPreviewProject = activeProject?.type === ProjectType.PREVIEW;

    useEffect(() => {
        window.addEventListener('unload', clearDashboardStorage);
        return () =>
            window.removeEventListener('unload', clearDashboardStorage);
    }, [clearDashboardStorage]);

    if (activeProject && getIsEditingDashboardChart()) {
        return (
            <DashboardExplorerBanner
                dashboardName={dashboardInfo.name || ''}
                projectUuid={activeProject.projectUuid}
                dashboardUuid={dashboardInfo.dashboardUuid || ''}
            />
        );
    }

    return (
        <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
            {activeProject?.type === ProjectType.PREVIEW ? (
                <PreviewBanner />
            ) : null}

            <Header
                height={NAVBAR_HEIGHT}
                fixed
                top={isPreviewProject ? BANNER_HEIGHT : 'none'}
                display="flex"
                px="md"
                zIndex={getDefaultZIndex('app')}
                sx={{
                    alignItems: 'center',
                    boxShadow: 'lg',
                }}
            >
                {/* Header content */}
                <Group align="center" sx={{ flexShrink: 0 }}>
                    <ActionIcon
                        component={Link}
                        to={homeUrl}
                        title="Home"
                        size="lg"
                    >
                        <Logo />
                    </ActionIcon>

                    {!isLoadingActiveProject && activeProject ? (
                        <>
                            <Button.Group>
                                <ExploreMenu
                                    projectUuid={activeProject.projectUuid}
                                />
                                <BrowseMenu
                                    projectUuid={activeProject.projectUuid}
                                />
                            </Button.Group>

                            <Divider
                                orientation="vertical"
                                my="xs"
                                color="gray.8"
                            />

                            <GlobalSearch
                                projectUuid={activeProject.projectUuid}
                            />
                        </>
                    ) : null}
                </Group>

                <Box sx={{ flexGrow: 1 }} />

                <PostHogFeature flag={'lightdash-team-flair'} match={true}>
                    <Group sx={{ flexShrink: 0 }}>
                        <span style={{ color: 'white' }}>LIGHTDASH TEAM</span>
                    </Group>
                </PostHogFeature>

                <Group sx={{ flexShrink: 0 }}>
                    <Button.Group>
                        <SettingsMenu />

                        {!isLoadingActiveProject && activeProject ? (
                            <NotificationsMenu
                                projectUuid={activeProject.projectUuid}
                            />
                        ) : null}

                        <HelpMenu />

                        {!isLoadingActiveProject && activeProject ? (
                            <HeadwayMenuItem
                                projectUuid={activeProject.projectUuid}
                            />
                        ) : null}
                    </Button.Group>

                    <Divider orientation="vertical" my="xs" color="gray.8" />

                    <ProjectSwitcher />

                    <UserMenu />
                </Group>
            </Header>
        </MantineProvider>
    );
});

export default NavBar;
