import { Box } from '@mantine/core';
import { IconLinkOff } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useParams } from 'react-router';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useCloneAgentThreadShareMutation } from '../../features/aiCopilot/hooks/useProjectAiAgents';

const AiAgentThreadSharePage: FC = () => {
    const { aiThreadShareUuid } = useParams();
    const projectUuid = useProjectUuid();
    const { mutate, isLoading, error } = useCloneAgentThreadShareMutation(
        projectUuid!,
    );

    useEffect(() => {
        if (aiThreadShareUuid) mutate(aiThreadShareUuid);
    }, [aiThreadShareUuid, mutate]);

    if (error?.error?.statusCode && error.error.statusCode !== 403) {
        return (
            <Box mt={50}>
                <SuboptimalState
                    title="Shared AI thread link does not exist"
                    icon={IconLinkOff}
                />
            </Box>
        );
    }

    return (
        <Box mt={50}>
            <SuboptimalState title="Loading..." loading={isLoading} />
        </Box>
    );
};

export default AiAgentThreadSharePage;
