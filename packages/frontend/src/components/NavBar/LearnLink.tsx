import { FeatureFlags } from '@lightdash/common';
import { Button, Menu } from '@mantine-8/core';
import { IconSchool } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import classes from './LearnLink.module.css';

interface Props {
    projectUuid: string;
    asMenu?: boolean;
}

export const LearnLink: FC<Props> = ({ projectUuid, asMenu }) => {
    const { user } = useApp();
    const navigate = useNavigate();
    const { track } = useTracking();
    const learnFlag = useServerFeatureFlag(FeatureFlags.LearnSection);

    const handleLearnClick = useCallback(() => {
        track({
            name: EventName.LEARN_CLICKED,
            properties: {
                userId: user?.data?.userUuid,
                organizationId: user?.data?.organizationUuid,
                projectId: projectUuid,
            },
        });
        void navigate(`/projects/${projectUuid}/learn`);
    }, [track, user, navigate, projectUuid]);

    if (learnFlag.isLoading || !learnFlag.data?.enabled) {
        return null;
    }

    if (asMenu) {
        return (
            <Menu.Item
                className={classes.menuItem}
                leftSection={<MantineIcon icon={IconSchool} />}
                onClick={handleLearnClick}
            >
                Learn
            </Menu.Item>
        );
    }

    return (
        <Button
            className={classes.topLevel}
            variant="default"
            size="xs"
            fz="sm"
            leftSection={<MantineIcon icon={IconSchool} color="ldGray.6" />}
            onClick={handleLearnClick}
        >
            Learn
        </Button>
    );
};
