import { CommercialFeatureFlags } from '@lightdash/common';
import {
    Box,
    Card,
    Loader,
    MantineProvider,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
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
                <Stack gap="sm">
                    <Box>
                        <Title order={4}>AI Agents</Title>
                    </Box>
                </Stack>

                <Text>
                    The AI Agents feature is not enabled for your organization.
                </Text>
            </SettingsGridCard>
        );
    }

    return (
        <MantineProvider>
            <Card withBorder shadow="subtle">
                <Stack gap="sm">
                    <Title order={4}>AI Agents</Title>

                    <Text size="xs" c="dimmed">
                        Create and manage your AI agents.
                    </Text>
                </Stack>

                <AiAgents />
            </Card>
        </MantineProvider>
    );
};

export default AiAgentsPanel;
