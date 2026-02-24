import { ActionIcon, Box, Button, Group } from '@mantine-8/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import Omnibar from '../../features/omnibar';
import useApp from '../../providers/App/useApp';
import Logo from '../../svgs/logo-icon.svg?react';
import { AgentCodingSessionsButton } from './AgentCodingSessionsButton';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import HeadwayMenuItem from './HeadwayMenuItem';
import HelpMenu from './HelpMenu';
import classes from './MainNavBarContent.module.css';
import { MetricsLink } from './MetricsLink';
import { NotificationsMenu } from './NotificationsMenu';
import ProjectSwitcher from './ProjectSwitcher';
import SettingsMenu from './SettingsMenu';
import { ThemeSwitcher } from './ThemeSwitcher';
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
    const { data: hasMetrics } = useHasMetricsInCatalog({
        projectUuid: activeProjectUuid,
    });
    const { health } = useApp();
    const headwayEnabled = health.data?.headway?.enabled;

    return (
        <>
            <Group align="center" className={classes.leftGroup}>
                <ActionIcon
                    component={Link}
                    to={homeUrl}
                    title="Home"
                    className={classes.logoButton}
                >
                    <Logo />
                </ActionIcon>

                {!isLoadingActiveProject && activeProjectUuid && (
                    <>
                        <Button.Group>
                            <ExploreMenu projectUuid={activeProjectUuid} />
                            <BrowseMenu projectUuid={activeProjectUuid} />
                            {hasMetrics && (
                                <MetricsLink projectUuid={activeProjectUuid} />
                            )}
                            <AgentCodingSessionsButton />
                        </Button.Group>
                        <Omnibar projectUuid={activeProjectUuid} />
                    </>
                )}
            </Group>

            <Box className={classes.spacer} />

            <Group className={classes.rightGroup}>
                <Button.Group>
                    <ThemeSwitcher />

                    <SettingsMenu />

                    {!isLoadingActiveProject && activeProjectUuid && (
                        <NotificationsMenu projectUuid={activeProjectUuid} />
                    )}

                    <HelpMenu />

                    {headwayEnabled &&
                        !isLoadingActiveProject &&
                        activeProjectUuid && (
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
