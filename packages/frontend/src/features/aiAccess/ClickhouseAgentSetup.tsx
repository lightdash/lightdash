import {
    buildClickhouseAiServiceAccountCommands,
    type ClickhouseCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

interface ClickhouseAgentSetupProps {
    connection: ClickhouseCredentials;
    hasCredentials: boolean;
    tested: boolean;
}

export const ClickhouseAgentSetup = ({
    connection,
    hasCredentials,
    tested,
}: ClickhouseAgentSetupProps) => {
    const commands = buildClickhouseAiServiceAccountCommands({
        schema: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="ClickHouse"
            hasAccount={hasCredentials}
            tested={tested}
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Run as a user with CREATE USER permission. Replace the
                        password placeholder. readonly = 2 keeps queries
                        read-only and allows the query settings agents need.
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.createUser}
                    />
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.grantReadAccess}
                    />
                    <Text size="sm" c="dimmed">
                        Grant SELECT on the project database, or limit the grant
                        to specific tables. The row policy is a template.
                        Replace the table and condition before you run it.
                        Everyone's agent shares this account's access.
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.rowPolicy}
                    />
                </Stack>
            }
            addHelp="Enter the ai_agents user and its password, then select Test and save."
        />
    );
};
