import { Box, Paper, Skeleton, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { useAiAgentAdminEmbedToken } from '../../hooks/useAiAgentAdmin';

export const AnalyticsEmbedDashboard: FC = () => {
    const { data: embedData, isLoading: isEmbedLoading } =
        useAiAgentAdminEmbedToken();

    if (!embedData) {
        return (
            <Paper h={450}>
                <Text c="ldGray.6">Unable to load analytics dashboard</Text>
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
                    title="Analytics Dashboard"
                />
            )}
        </Box>
    );
};
