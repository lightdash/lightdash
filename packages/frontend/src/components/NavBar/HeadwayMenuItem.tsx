import { Box, Button } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';

import { FC, useEffect } from 'react';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

type Props = {
    projectUuid?: string;
};

const HeadwayMenuItem: FC<Props> = ({ projectUuid }) => {
    const { track } = useTracking();
    const { user } = useApp();

    useEffect(() => {
        if (!projectUuid) return;

        const trackNotifications = {
            user_id: user.data?.userUuid,
            project_id: projectUuid,
            organization_id: user.data?.organizationUuid,
        };
        if ((window as any) && (window as any).Headway) {
            (window as any).Headway.init({
                selector: '#headway-badge',
                trigger: '#headway-trigger',
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

    if (!projectUuid) return null;

    return (
        <Button variant="default" compact pos="relative" id="headway-trigger">
            <MantineIcon icon={IconBell} />
            <Box
                id="headway-badge"
                pos="absolute"
                sx={{
                    pointerEvents: 'none',
                    top: 8,
                    '.HW_badge.HW_softHidden': {
                        background: 'transparent',
                    },
                }}
            />
        </Button>
    );
};

export default HeadwayMenuItem;
