import {
    buildPostgresAiServiceAccountCommands,
    type PostgresCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const PostgresAgentSetup = ({
    connection,
    hasCredentials,
    tested,
}: {
    connection: PostgresCredentials;
    hasCredentials: boolean;
    tested: boolean;
}) => {
    const commands = buildPostgresAiServiceAccountCommands({
        dbname: connection.dbname,
        schema: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Postgres"
            hasAccount={hasCredentials}
            tested={tested}
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Run as a superuser or a role with CREATEROLE. Choose a
                        strong password for this separate login role.
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.createRole}
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
                        Grant only the data every agent user may see. Run ALTER
                        DEFAULT PRIVILEGES as each role that creates tables. It
                        applies to new tables from that role.
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.rowLevelSecurity}
                    />
                    <Text size="sm" c="dimmed">
                        Replace the table and condition placeholders. Row-level
                        security does not apply to superusers, roles with
                        BYPASSRLS, or the table owner unless FORCE ROW LEVEL
                        SECURITY is set.
                    </Text>
                    <Text size="sm" c="dimmed">
                        To hide sensitive columns, replace table-wide SELECT
                        grants with column grants such as GRANT SELECT (col_a,
                        col_b). A table-wide grant still allows every column.
                    </Text>
                </Stack>
            }
            addHelp="Enter the ai_agents user and its password, then select Test."
        />
    );
};
