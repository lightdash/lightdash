import { Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentSetupStep } from './AgentSetupStep';

export const AiServiceAccountSetupGuide = ({
    warehouseName,
    createContent,
    grantContent,
    addHelp,
    createTitle,
    grantTitle,
    addTitle,
}: {
    warehouseName: string;
    createContent: ReactNode;
    grantContent: ReactNode;
    addHelp: string;
    createTitle?: string;
    grantTitle?: string;
    addTitle?: string;
}) => {
    const { t } = useTranslation('aiAccess');
    return (
        <Stack gap="lg" mt="lg">
            <AgentSetupStep
                number={1}
                title={
                    createTitle ??
                    t('setupGuide.createTitle', { warehouse: warehouseName })
                }
                done={false}
            >
                {createContent}
            </AgentSetupStep>
            <AgentSetupStep
                number={2}
                title={grantTitle ?? t('setupGuide.grantTitle')}
                done={false}
            >
                {grantContent}
            </AgentSetupStep>
            <AgentSetupStep
                number={3}
                title={addTitle ?? t('setupGuide.addTitle')}
                done={false}
            >
                <Text size="sm" c="dimmed">
                    {addHelp}
                </Text>
            </AgentSetupStep>
        </Stack>
    );
};
