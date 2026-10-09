import {
    buildDatabricksAiServiceAccountCommands,
    type DatabricksCredentials,
} from '@lightdash/common';
import { Accordion, Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AgentSetupStep } from './AgentSetupStep';

export const DatabricksAgentSetup = ({
    connection,
    hasCredentials,
    tested,
}: {
    connection: DatabricksCredentials;
    hasCredentials: boolean;
    tested: boolean;
}) => (
    <Accordion defaultValue={hasCredentials ? null : 'setup'} variant="default">
        <Accordion.Item value="setup">
            <Accordion.Control>Set up the AI service account</Accordion.Control>
            <Accordion.Panel>
                <Stack gap="lg">
                    <AgentSetupStep
                        number={1}
                        title="Create the service principal and an OAuth secret"
                        done={false}
                    >
                        <Text size="sm" c="dimmed">
                            Create the service principal and an OAuth secret in
                            the Databricks account console. Add it to the
                            workspace and give it CAN USE on the SQL warehouse.
                            Use its application ID as the client ID.
                        </Text>
                    </AgentSetupStep>
                    <AgentSetupStep
                        number={2}
                        title="Grant access to the data agents may read"
                        done={false}
                    >
                        <Stack gap="xs">
                            <CodeBlock
                                language="sql"
                                copyLabel="Copy SQL"
                                code={buildDatabricksAiServiceAccountCommands({
                                    catalog: connection.catalog || null,
                                    schema: connection.database || null,
                                })}
                            />
                            <Text size="sm" c="dimmed">
                                Replace the placeholders and repeat SELECT for
                                each permitted table or view. Unity Catalog row
                                filters and column masks apply to this
                                principal. Grant only the data every agent user
                                may see.
                            </Text>
                        </Stack>
                    </AgentSetupStep>
                    <AgentSetupStep
                        number={3}
                        title="Add the client ID and secret here, then Test and save"
                        done={hasCredentials && tested}
                    />
                    <AgentSetupStep
                        number={4}
                        title={
                            'Choose "The AI service account" in the organisation agent identity rule'
                        }
                        done={false}
                    />
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    </Accordion>
);
