import {
    buildBigQueryAiServiceAccountCommands,
    type BigqueryCredentials,
} from '@lightdash/common';
import { Accordion, Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AgentSetupStep } from './AgentSetupStep';

export const BigQueryAgentSetup = ({
    connection,
    hasKey,
    tested,
}: {
    connection: BigqueryCredentials;
    hasKey: boolean;
    tested: boolean;
}) => {
    const commands = buildBigQueryAiServiceAccountCommands({
        project: connection.project,
        executionProject: connection.executionProject || null,
        dataset: connection.dataset || null,
    });
    return (
        <Accordion defaultValue={hasKey ? null : 'setup'} variant="default">
            <Accordion.Item value="setup">
                <Accordion.Control>
                    Set up the AI service account
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="lg">
                        <AgentSetupStep
                            number={1}
                            title="Create the service account and grant access"
                            done={false}
                        >
                            <Stack gap="xs">
                                <CodeBlock
                                    codeColorScheme="dark"
                                    background="dark.7"
                                    radius="sm"
                                    language="bash"
                                    copyLabel="Copy commands"
                                    code={commands
                                        .map(({ command }) => command)
                                        .join('\n\n')}
                                />
                                {!connection.dataset && (
                                    <Text size="sm" c="dimmed">
                                        Grant Data Viewer on each dataset agents
                                        may read.
                                    </Text>
                                )}
                                <Text size="sm" c="dimmed">
                                    Grant only the data every agent user may
                                    see.
                                </Text>
                            </Stack>
                        </AgentSetupStep>
                        <AgentSetupStep
                            number={2}
                            title="Create a JSON key and upload it below"
                            done={hasKey}
                        />
                        <AgentSetupStep
                            number={3}
                            title="Select Test"
                            done={tested}
                        />
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    );
};
