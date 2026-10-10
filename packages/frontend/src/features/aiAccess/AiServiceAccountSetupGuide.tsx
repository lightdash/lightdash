import { Accordion, Stack, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { AgentSetupStep } from './AgentSetupStep';

export const AiServiceAccountSetupGuide = ({
    warehouseName,
    hasAccount,
    tested,
    createContent,
    grantContent,
    addHelp,
    createTitle = `Create the account in ${warehouseName}`,
    grantTitle = 'Grant it only the data agents may read',
    addTitle = 'Add it here and select Test',
}: {
    warehouseName: string;
    hasAccount: boolean;
    tested: boolean;
    createContent: ReactNode;
    grantContent: ReactNode;
    addHelp: string;
    createTitle?: string;
    grantTitle?: string;
    addTitle?: string;
}) => (
    <Accordion defaultValue={hasAccount ? null : 'setup'} variant="default">
        <Accordion.Item value="setup">
            <Accordion.Control>
                How to set up the AI service account
            </Accordion.Control>
            <Accordion.Panel>
                <Stack gap="lg">
                    <AgentSetupStep number={1} title={createTitle} done={false}>
                        {createContent}
                    </AgentSetupStep>
                    <AgentSetupStep number={2} title={grantTitle} done={false}>
                        {grantContent}
                    </AgentSetupStep>
                    <AgentSetupStep number={3} title={addTitle} done={tested}>
                        <Text size="sm" c="dimmed">
                            {addHelp}
                        </Text>
                    </AgentSetupStep>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    </Accordion>
);
