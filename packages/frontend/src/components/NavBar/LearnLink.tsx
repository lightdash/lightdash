import { FeatureFlags } from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { IconSchool } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useNavigate } from 'react-router';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

interface Props {
    projectUuid: string;
}

export const LearnLink: FC<Props> = ({ projectUuid }) => {
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

    return (
        <Button
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
