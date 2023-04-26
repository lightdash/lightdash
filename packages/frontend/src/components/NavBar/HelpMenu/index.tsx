import { ActionIcon, Button, Menu } from '@mantine/core';
import {
    IconBell,
    IconBook,
    IconHelp,
    IconMessageCircle2,
    IconMessages,
    IconUsers,
} from '@tabler/icons-react';
import { FC, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useIntercom } from 'react-use-intercom';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import LargeMenuItem from '../../common/LargeMenuItem';
import MantineIcon from '../../common/MantineIcon';
import { NotificationWidget, NotificationWrapper } from './HelpMenu.styles';

const HelpMenu: FC = () => {
    const { show: showIntercom } = useIntercom();
    const { track } = useTracking();
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    useEffect(() => {
        const trackNotifications = {
            user_id: user.data?.userUuid,
            project_id: projectUuid,
            organization_id: user.data?.organizationUuid,
        };
        if ((window as any) && (window as any).Headway) {
            (window as any).Headway.init({
                selector: '#headway-badge',
                account: '7L3Bzx',
                callbacks: {
                    onShowWidget: () => {
                        track({
                            name: EventName.NOTIFICATIONS_CLICKED,
                            properties: { ...trackNotifications },
                        });
                    },
                    onShowDetails: (changelog: any) => {
                        track({
                            name: EventName.NOTIFICATIONS_ITEM_CLICKED,
                            properties: {
                                ...trackNotifications,
                                item: changelog.title,
                            },
                        });
                    },
                    onReadMore: () => {
                        track({
                            name: EventName.NOTIFICATIONS_CLICKED,
                            properties: { ...trackNotifications },
                        });
                    },
                },
            });
        }
    }, [track, projectUuid, user.data?.organizationUuid, user.data?.userUuid]);

    return (
        <>
            <NotificationWrapper>
                <ActionIcon>
                    <MantineIcon icon={IconBell} size="lg" />
                </ActionIcon>
                <NotificationWidget id="headway-badge" />
            </NotificationWrapper>

            <Menu
                withArrow
                shadow="lg"
                position="bottom-end"
                arrowOffset={16}
                offset={-2}
            >
                <Menu.Target>
                    <ActionIcon>
                        <IconHelp size={20} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown>
                    <LargeMenuItem
                        onClick={() => showIntercom()}
                        title="Contact support"
                        description="Drop us a message and we’ll get back to you asap!"
                        icon={<MantineIcon icon={IconMessages} size="lg" />}
                    />

                    <LargeMenuItem
                        // href="https://docs.lightdash.com/"
                        // target="_blank"
                        title="View Docs"
                        description="Learn how to deploy, use, contribute to Lightdash."
                        icon={<MantineIcon icon={IconBook} size="lg" />}
                    />

                    <LargeMenuItem
                        // href="https://join.slack.com/t/lightdash-community/shared_invite/zt-16q953ork-NZr1qdEqxSwB17E2ckUe7A"
                        // target="_blank"
                        title="Join Slack community"
                        description="Get advice share best practices with other users."
                        icon={<MantineIcon icon={IconUsers} size="lg" />}
                    />

                    <LargeMenuItem
                        // href="https://github.com/lightdash/lightdash/issues/new/choose"
                        // target="_blank"
                        title="Feedback on Lightdash"
                        description="Submit a feature request or bug report to improve Lightdash."
                        icon={
                            <MantineIcon icon={IconMessageCircle2} size="lg" />
                        }
                    />
                </Menu.Dropdown>
            </Menu>
        </>
    );
};

export default HelpMenu;
