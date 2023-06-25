import { ProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    Divider,
    Group,
    Header,
    MantineProvider,
    Text,
} from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProjects } from '../../hooks/useProjects';
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

export const NAVBAR_HEIGHT = 50;
const PREVIEW_BANNER_HEIGHT = 20;

const PreviewBanner = () => (
    <Center pos="fixed" w="100%" h={PREVIEW_BANNER_HEIGHT} bg="blue.6">
        <MantineIcon icon={IconTool} color="white" size="sm" />
        <Text color="white" fw={500} fz="xs">
            This is a preview environment. Any changes you make here will not
            affect production.
        </Text>
    </Center>
);

const NavBar = memo(() => {
    const { data: projects } = useProjects();
    const { activeProjectUuid, isLoading: isLoadingActiveProject } =
        useActiveProjectUuid();

    const homeUrl = activeProjectUuid
        ? `/projects/${activeProjectUuid}/home`
        : '/';

    const isCurrentProjectPreview = !!projects?.find(
        (project) =>
            project.projectUuid === activeProjectUuid &&
            project.type === ProjectType.PREVIEW,
    );

    return (
        <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
            {isCurrentProjectPreview ? <PreviewBanner /> : null}
            {/* hack to make navbar fixed and maintain space */}
            <Box
                h={
                    NAVBAR_HEIGHT +
                    (isCurrentProjectPreview ? PREVIEW_BANNER_HEIGHT : 0)
                }
            />
            <Header
                height={NAVBAR_HEIGHT}
                fixed
                mt={isCurrentProjectPreview ? PREVIEW_BANNER_HEIGHT : 'none'}
                display="flex"
                px="md"
                // FIXME: adjust after removing Blueprint
                zIndex={999}
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
