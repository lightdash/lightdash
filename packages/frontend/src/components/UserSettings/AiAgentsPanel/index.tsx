import { CommercialFeatureFlags } from '@lightdash/common';
import { Box, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { AiAgents } from '../../../ee/features/aiCopilot/components/AiAgents';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const AiAgentsPanel: FC = () => {
    const { data: aiCopilotFlag, isLoading } = useFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );

    if (isLoading) {
        return <Loader />;
    }

    const isAiCopilotEnabled = aiCopilotFlag?.enabled;

    if (!isAiCopilotEnabled) {
        return (
            <SettingsGridCard>
                <Stack spacing="sm">
                    <Box>
                        <Group spacing="sm">
                            <Title order={4}>AI Agents</Title>
                        </Group>
                    </Box>
                </Stack>

                <Text>
                    The AI Agents feature is not enabled for your organization.
                </Text>
            </SettingsGridCard>
        );
    }

    return (
        <SettingsGridCard>
            <Stack spacing="sm">
                <Title order={4}>AI Agents</Title>

                <Text size="xs" color="dimmed">
                    Create and manage your AI agents.
                </Text>
            </Stack>
            <AiAgents />
        </SettingsGridCard>
    );
};

export default AiAgentsPanel;
