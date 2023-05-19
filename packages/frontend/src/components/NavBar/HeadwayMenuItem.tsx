import { Box, Button, Indicator, Tooltip } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { FC, useEffect } from 'react';
import useHeadway from '../../hooks/thirdPartyServices/useHeadway';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

type Props = {
    projectUuid?: string;
};

const HeadwayMenuItem: FC<Props> = ({ projectUuid }) => {
    const { track } = useTracking();
    const { user } = useApp();
    const isHeadwayloaded = useHeadway();

    useEffect(() => {
        if (!projectUuid || !isHeadwayloaded) return;

        const trackNotifications = {
            user_id: user.data?.userUuid,
            project_id: projectUuid,
            organization_id: user.data?.organizationUuid,
        };

        (window as any)?.Headway?.init({
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
    }, [
        track,
        projectUuid,
        user.data?.organizationUuid,
        user.data?.userUuid,
        isHeadwayloaded,
    ]);

    if (!isHeadwayloaded || !projectUuid) return null;

    return (
        <Tooltip color="dark" label="What's new?">
            <Indicator
                color="transparent"
                offset={8}
                label={
                    <Box
                        id="headway-badge"
                        sx={{
                            pointerEvents: 'none',
                            '.HW_badge.HW_softHidden': {
                                background: 'transparent !important',
                            },
                            '.HW_badge.HW_bounce': {
                                animation: 'none !important',
                            },
                        }}
                    />
                }
            >
                <Button
                    variant="default"
                    size="xs"
                    pos="relative"
                    id="headway-trigger"
                >
                    <MantineIcon icon={IconSparkles} size="lg" />
                </Button>
            </Indicator>
        </Tooltip>
    );
};

export default HeadwayMenuItem;
