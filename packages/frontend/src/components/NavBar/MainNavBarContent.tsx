import { ActionIcon, Box, Button, Group, Image } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import Omnibar from '../../features/omnibar';
import { useApp } from '../../providers/AppProvider';
import Logo from '../../svgs/logo-icon.svg?react';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import HeadwayMenuItem from './HeadwayMenuItem';
import HelpMenu from './HelpMenu';
import { NotificationsMenu } from './NotificationsMenu';
import ProjectSwitcher from './ProjectSwitcher';
import SettingsMenu from './SettingsMenu';
import UserCredentialsSwitcher from './UserCredentialsSwitcher';
import UserMenu from './UserMenu';

type Props = {
    activeProjectUuid: string | undefined;
    isLoadingActiveProject: boolean;
};

export const MainNavBarContent: FC<Props> = ({
    activeProjectUuid,
    isLoadingActiveProject,
}) => {
    const homeUrl = activeProjectUuid
        ? `/projects/${activeProjectUuid}/home`
        : '/';
    const { health } = useApp();
    return (
        <>
            <Group align="center" sx={{ flexShrink: 0 }}>
                <ActionIcon
                    component={Link}
                    to={homeUrl}
                    title="Home"
                    size="lg"
                >
                    {health.data?.siteLogo ? (
                        <Image
                            src={health.data?.siteLogo}
                            width={36}
                            height={36}
                            alt={
                                health.data?.siteLogoAlt
                                    ? health.data?.siteLogoAlt
                                    : 'logo'
                            }
                        />
                    ) : (
                        <Logo />
                    )}
                </ActionIcon>

                {!isLoadingActiveProject && activeProjectUuid && (
                    <>
                        <Button.Group>
                            <ExploreMenu projectUuid={activeProjectUuid} />
                            <BrowseMenu projectUuid={activeProjectUuid} />
                        </Button.Group>
                        <Omnibar projectUuid={activeProjectUuid} />
                    </>
                )}
            </Group>

            <Box sx={{ flexGrow: 1 }} />

            <Group sx={{ flexShrink: 0 }}>
                <Button.Group>
                    <SettingsMenu />

                    {!isLoadingActiveProject && activeProjectUuid && (
                        <NotificationsMenu projectUuid={activeProjectUuid} />
                    )}

                    <HelpMenu />

                    {!isLoadingActiveProject && activeProjectUuid && (
                        <HeadwayMenuItem projectUuid={activeProjectUuid} />
                    )}

                    <ProjectSwitcher />
                </Button.Group>

                <UserCredentialsSwitcher />
                <UserMenu />
            </Group>
        </>
    );
};
