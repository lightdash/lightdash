import { Box, Paper, Skeleton, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiAgentAdminEmbedToken } from '../../hooks/useAiAgentAdmin';

export const AnalyticsEmbedDashboard: FC = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { data: embedData, isLoading: isEmbedLoading } =
        useAiAgentAdminEmbedToken();

    if (!embedData) {
        return (
            <Paper h={450}>
                <Text c="dimmed">{t('analyticsEmbed.loadError')}</Text>
            </Paper>
        );
    }

    return (
        <Box h={500}>
            {isEmbedLoading ? (
                <Skeleton h={450} />
            ) : (
                <iframe
                    src={embedData.url}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{
                        border: 'none',
                    }}
                    title={t('analyticsEmbed.iframeTitle')}
                />
            )}
        </Box>
    );
};
