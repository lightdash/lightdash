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
import { FC, memo, useEffect, useMemo } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProjects } from '../../hooks/useProjects';
import Logo from '../../svgs/logo-icon.svg?react';
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

export const NAVBAR_HEIGHT = 50;
export const BANNER_HEIGHT = 35;

const PreviewBanner = () => (
    <Center pos="fixed" w="100%" h={BANNER_HEIGHT} bg="blue.6">
        <MantineIcon icon={IconTool} color="white" size="sm" />
        <Text color="white" fw={500} fz="xs" mx="xxs">
            This is a preview environment. Any changes you make here will not
            affect production.
        </Text>
    </Center>
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
        <Center w="100%" h={BANNER_HEIGHT} bg="blue.6">
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
        </Center>
    );
};

const NavBar = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: projects } = useProjects();
    const { activeProjectUuid, isLoading: isLoadingActiveProject } =
        useActiveProjectUuid({ refetchOnMount: true });
    const {
        getIsEditingDashboardChart,
        getEditingDashboardInfo,
        clearDashboardStorage,
    } = useDashboardStorage();

    const dashboardInfo = getEditingDashboardInfo();

    const homeUrl = activeProjectUuid
        ? `/projects/${activeProjectUuid}/home`
        : '/';

    const isCurrentProjectPreview = !!projects?.find(
        (project) =>
            project.projectUuid === activeProjectUuid &&
            project.type === ProjectType.PREVIEW,
    );

    useEffect(() => {
        window.addEventListener('unload', clearDashboardStorage);
        return () =>
            window.removeEventListener('unload', clearDashboardStorage);
    }, [clearDashboardStorage]);

    if (getIsEditingDashboardChart()) {
        return (
            <DashboardExplorerBanner
                dashboardName={dashboardInfo.name || ''}
                projectUuid={projectUuid}
                dashboardUuid={dashboardInfo.dashboardUuid || ''}
            />
        );
    }

    return (
        <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
            {isCurrentProjectPreview ? <PreviewBanner /> : null}
            {/* hack to make navbar fixed and maintain space */}
            <Box
                h={
                    NAVBAR_HEIGHT +
                    (isCurrentProjectPreview ? BANNER_HEIGHT : 0)
                }
            />
            <Header
                height={NAVBAR_HEIGHT}
                fixed
                mt={isCurrentProjectPreview ? BANNER_HEIGHT : 'none'}
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

                    {!isLoadingActiveProject && activeProjectUuid ? (
                        <>
                            <Button.Group>
                                <ExploreMenu projectUuid={activeProjectUuid} />
                                <BrowseMenu projectUuid={activeProjectUuid} />
                            </Button.Group>

                            <Divider
                                orientation="vertical"
                                my="xs"
                                color="gray.8"
                            />

                            <GlobalSearch projectUuid={activeProjectUuid} />
                        </>
                    ) : null}
                </Group>

                <Box sx={{ flexGrow: 1 }} />

                <Group sx={{ flexShrink: 0 }}>
                    <Button.Group>
                        <SettingsMenu />

                        {!isLoadingActiveProject && activeProjectUuid ? (
                            <NotificationsMenu
                                projectUuid={activeProjectUuid}
                            />
                        ) : null}

                        <HelpMenu />

                        {!isLoadingActiveProject && activeProjectUuid ? (
                            <HeadwayMenuItem projectUuid={activeProjectUuid} />
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
