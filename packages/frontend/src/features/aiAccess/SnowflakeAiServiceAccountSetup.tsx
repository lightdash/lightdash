import { Accordion, Code, Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';

const setupSql = `CREATE USER AI_AGENT
  TYPE = SERVICE_AGENT
  RSA_PUBLIC_KEY = '<public key without PEM headers>'
  DEFAULT_ROLE = AI_AGENT_ROLE
  DEFAULT_WAREHOUSE = AI_AGENT_WH;
GRANT ROLE AI_AGENT_ROLE TO USER AI_AGENT;`;

export const SnowflakeAiServiceAccountSetup = ({
    hasKey,
}: {
    hasKey: boolean;
}) => (
    <Accordion defaultValue={hasKey ? null : 'setup'} variant="default">
        <Accordion.Item value="setup">
            <Accordion.Control>Set up the AI service account</Accordion.Control>
            <Accordion.Panel>
                <Stack gap="sm">
                    <Text size="sm">
                        Use a separate Snowflake user and role for AI agents. We
                        recommend <Code>TYPE = SERVICE_AGENT</Code>, so
                        Snowflake marks each session as agent-active. Grant the
                        role only the data that agents may read.
                    </Text>
                    <Text size="sm" c="dimmed">
                        The role and warehouse must exist. Grant the role USAGE
                        on the warehouse, database and schema, and access to the
                        data that agents may read.
                    </Text>
                    <CodeBlock
                        language="sql"
                        code={setupSql}
                        copyLabel="Copy SQL"
                    />
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    </Accordion>
);
