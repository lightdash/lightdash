import {
    Button,
    Colors,
    Icon,
    Menu,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    IconBell,
    IconBook,
    IconFlag,
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
import {
    LargeMenuItem,
    LargeMenuItemIconWrapper,
    LargeMenuItemSubText,
    LargeMenuItemText,
} from '../ExploreMenu/ExploreMenu.styles';
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
                <Button
                    minimal
                    icon={<IconBell size={20} color={Colors.GRAY4} />}
                />
                <NotificationWidget id="headway-badge" />
            </NotificationWrapper>
            <Popover2
                interactionKind={PopoverInteractionKind.CLICK}
                content={
                    <Menu large>
                        <LargeMenuItem
                            onClick={() => showIntercom()}
                            icon={
                                <LargeMenuItemIconWrapper>
                                    <IconMessages
                                        size={22}
                                        color={Colors.WHITE}
                                    />
                                </LargeMenuItemIconWrapper>
                            }
                            text={
                                <>
                                    <LargeMenuItemText>
                                        Contact support
                                    </LargeMenuItemText>
                                    <LargeMenuItemSubText>
                                        Drop us a message and we’ll get back to
                                        you asap!
                                    </LargeMenuItemSubText>
                                </>
                            }
                        />

                        <LargeMenuItem
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            icon={
                                <LargeMenuItemIconWrapper>
                                    <IconBook size={22} color={Colors.WHITE} />
                                </LargeMenuItemIconWrapper>
                            }
                            text={
                                <>
                                    <LargeMenuItemText>
                                        View Docs
                                    </LargeMenuItemText>
                                    <LargeMenuItemSubText>
                                        Learn how to deploy, use, contribute to
                                        Lightdash.
                                    </LargeMenuItemSubText>
                                </>
                            }
                        />

                        <LargeMenuItem
                            href="https://join.slack.com/t/lightdash-community/shared_invite/zt-16q953ork-NZr1qdEqxSwB17E2ckUe7A"
                            target="_blank"
                            icon={
                                <LargeMenuItemIconWrapper>
                                    <IconUsers size={22} color={Colors.WHITE} />
                                </LargeMenuItemIconWrapper>
                            }
                            text={
                                <>
                                    <LargeMenuItemText>
                                        Join Slack community
                                    </LargeMenuItemText>
                                    <LargeMenuItemSubText>
                                        Get advice share best practices with
                                        other users.
                                    </LargeMenuItemSubText>
                                </>
                            }
                        />

                        <LargeMenuItem
                            href="https://github.com/lightdash/lightdash/issues/new/choose"
                            target="_blank"
                            icon={
                                <LargeMenuItemIconWrapper>
                                    <IconMessageCircle2
                                        size={22}
                                        color={Colors.WHITE}
                                    />
                                </LargeMenuItemIconWrapper>
                            }
                            text={
                                <>
                                    <LargeMenuItemText>
                                        Feedback on Lightdash
                                    </LargeMenuItemText>
                                    <LargeMenuItemSubText>
                                        Submit a feature request or bug report
                                        to improve Lightdash.
                                    </LargeMenuItemSubText>
                                </>
                            }
                        />
                    </Menu>
                }
                position={Position.BOTTOM_LEFT}
            >
                <Button
                    minimal
                    icon={<IconHelp size={20} color={Colors.GRAY4} />}
                />
            </Popover2>
        </>
    );
};

export default HelpMenu;
