import { Box } from '@mantine/core';
import { IconLinkOff } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useCloneAgentThreadShareMutation } from '../../features/aiCopilot/hooks/useProjectAiAgents';

const AiAgentThreadSharePage: FC = () => {
    const { t } = useTranslation('eeMisc');
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
                    title={t('agents.sharePage.notFound')}
                    icon={IconLinkOff}
                />
            </Box>
        );
    }

    return (
        <Box mt={50}>
            <SuboptimalState
                title={t('agents.sharePage.loading')}
                loading={isLoading}
            />
        </Box>
    );
};

export default AiAgentThreadSharePage;
