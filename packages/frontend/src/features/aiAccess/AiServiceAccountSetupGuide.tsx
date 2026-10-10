import { Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { AgentSetupStep } from './AgentSetupStep';

export const AiServiceAccountSetupGuide = ({
    warehouseName,
    tested,
    createContent,
    grantContent,
    addHelp,
    createTitle = `Create the account in ${warehouseName}`,
    grantTitle = 'Grant it only the data agents may read',
    addTitle = 'Add it here and select Test',
}: {
    warehouseName: string;
    tested: boolean;
    createContent: ReactNode;
    grantContent: ReactNode;
    addHelp: string;
    createTitle?: string;
    grantTitle?: string;
    addTitle?: string;
}) => {
    if (tested) return null;

    return (
        <Stack gap="lg" mt="lg">
            <AgentSetupStep number={1} title={createTitle} done={false}>
                {createContent}
            </AgentSetupStep>
            <AgentSetupStep number={2} title={grantTitle} done={false}>
                {grantContent}
            </AgentSetupStep>
            <AgentSetupStep number={3} title={addTitle} done={false}>
                <Text size="sm" c="dimmed">
                    {addHelp}
                </Text>
            </AgentSetupStep>
        </Stack>
    );
};
