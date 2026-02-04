import { Box, Button, Tooltip } from '@mantine-8/core';
import { IconSparkles } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import useHeadway from '../../hooks/thirdPartyServices/useHeadway';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import classes from './HeadwayMenuItem.module.css';

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
        <Tooltip label="What's new?" withinPortal>
            <Button
                variant="default"
                size="xs"
                pos="relative"
                id="headway-trigger"
            >
                <MantineIcon icon={IconSparkles} />
                <Box
                    id="headway-badge"
                    pos="absolute"
                    className={classes.badge}
                />
            </Button>
        </Tooltip>
    );
};

export default HeadwayMenuItem;
