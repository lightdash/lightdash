import { ProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Header,
    MantineProvider,
    Select,
} from '@mantine/core';
import { memo } from 'react';
import { Link, useHistory } from 'react-router-dom';

import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useProject';
import { setLastProject, useProjects } from '../../hooks/useProjects';
import { useErrorLogs } from '../../providers/ErrorLogsProvider';
import { ReactComponent as Logo } from '../../svgs/logo-icon.svg';
import { ErrorLogsDrawer } from '../ErrorLogsDrawer';
import { ShowErrorsButton } from '../ShowErrorsButton';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import GlobalSearch from './GlobalSearch';
import HeadwayMenuItem from './HeadwayMenuItem';
import HelpMenu from './HelpMenu';
import { NotificationsMenu } from './NotificationsMenu';
import SettingsMenu from './SettingsMenu';
import UserMenu from './UserMenu';

export const NAVBAR_HEIGHT = 50;

const NavBar = memo(() => {
    const { errorLogs, setErrorLogsVisible } = useErrorLogs();
    const { showToastSuccess } = useToaster();
    const { isLoading, data: projects } = useProjects();
    const activeProjectUuid = useActiveProjectUuid();

    const history = useHistory();

    const homeUrl = activeProjectUuid
        ? `/projects/${activeProjectUuid}/home`
        : '/';

    return (
        <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
            {/* hack to make navbar fixed and maintain space */}
            <Box h={NAVBAR_HEIGHT} />

            <Header
                height={NAVBAR_HEIGHT}
                fixed
                display="flex"
                px="md"
                // FIXME: adjust after removing Blueprint
                zIndex={10}
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

                    {!!activeProjectUuid && (
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
                    )}
                </Group>

                <Box sx={{ flexGrow: 1 }} />

                <Group sx={{ flexShrink: 0 }}>
                    <ErrorLogsDrawer />
                    <ShowErrorsButton
                        errorLogs={errorLogs}
                        setErrorLogsVisible={setErrorLogsVisible}
                    />

                    <Button.Group>
                        <SettingsMenu />
                        {activeProjectUuid && (
                            <NotificationsMenu
                                projectUuid={activeProjectUuid}
                            />
                        )}
                        <HelpMenu />
                        <HeadwayMenuItem projectUuid={activeProjectUuid} />
                    </Button.Group>

                    <Divider orientation="vertical" my="xs" color="gray.8" />

                    {activeProjectUuid && (
                        <Select
                            size="xs"
                            w={200}
                            disabled={isLoading || (projects || []).length <= 0}
                            data={
                                projects?.map((item) => ({
                                    value: item.projectUuid,
                                    label: `${
                                        item.type === ProjectType.PREVIEW
                                            ? '[Preview] '
                                            : ''
                                    }${item.name}`,
                                })) ?? []
                            }
                            value={activeProjectUuid}
                            onChange={(newUuid) => {
                                if (!newUuid) return;

                                setLastProject(newUuid);
                                showToastSuccess({
                                    icon: 'tick',
                                    title: `You are now viewing ${
                                        projects?.find(
                                            (p) => p.projectUuid === newUuid,
                                        )?.name
                                    }`,
                                });
                                history.push(`/projects/${newUuid}/home`);
                            }}
                        />
                    )}
                    <UserMenu />
                </Group>
            </Header>
        </MantineProvider>
    );
});

export default NavBar;
