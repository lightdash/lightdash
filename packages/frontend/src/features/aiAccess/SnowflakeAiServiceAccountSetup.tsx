import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

const setupSql = `CREATE USER AI_AGENT
  TYPE = SERVICE_AGENT
  RSA_PUBLIC_KEY = '<public key without PEM headers>'
  DEFAULT_ROLE = AI_AGENT_ROLE
  DEFAULT_WAREHOUSE = AI_AGENT_WH;
GRANT ROLE AI_AGENT_ROLE TO USER AI_AGENT;`;

const grantSql = `GRANT USAGE ON WAREHOUSE AI_AGENT_WH TO ROLE AI_AGENT_ROLE;
GRANT USAGE ON DATABASE <database> TO ROLE AI_AGENT_ROLE;
GRANT USAGE ON SCHEMA <database>.<schema> TO ROLE AI_AGENT_ROLE;
GRANT SELECT ON TABLE <database>.<schema>.<table> TO ROLE AI_AGENT_ROLE;`;

export const SnowflakeAiServiceAccountSetup = ({
    hasKey,
    tested,
}: {
    hasKey: boolean;
    tested: boolean;
}) => (
    <AiServiceAccountSetupGuide
        warehouseName="Snowflake"
        hasAccount={hasKey}
        tested={tested}
        createContent={
            <Stack gap="xs">
                <CodeBlock
                    language="sql"
                    code={setupSql}
                    copyLabel="Copy SQL"
                />
                <Text size="sm" c="dimmed">
                    Use TYPE = SERVICE_AGENT so Snowflake marks these sessions
                    as agent sessions.
                </Text>
            </Stack>
        }
        grantContent={
            <Stack gap="xs">
                <CodeBlock
                    language="sql"
                    code={grantSql}
                    copyLabel="Copy SQL"
                />
                <Text size="sm" c="dimmed">
                    Repeat SELECT for each table agents may read.
                </Text>
            </Stack>
        }
        addHelp="Add the user's private key, role and warehouse, then select Test."
    />
);
