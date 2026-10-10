import {
    buildRedshiftAiServiceAccountCommands,
    type RedshiftCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

interface RedshiftAgentSetupProps {
    connection: RedshiftCredentials;
    hasCredentials: boolean;
    tested: boolean;
}

export const RedshiftAgentSetup = ({
    connection,
    hasCredentials,
    tested,
}: RedshiftAgentSetupProps) => {
    const commands = buildRedshiftAiServiceAccountCommands({
        schema: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Redshift"
            hasAccount={hasCredentials}
            tested={tested}
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Run as a superuser or a user with CREATE USER. Use an 8
                        to 64 character password with uppercase, lowercase and a
                        number. Use ASCII characters. Exclude spaces, quotes,
                        backslashes, slashes and @.
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
                        Run in the project database. Replace placeholders.
                        Repeat ALTER DEFAULT PRIVILEGES for each table owner. It
                        grants access to future tables.
                    </Text>
                    <Text size="sm" c="dimmed">
                        These RLS and masking policies are templates. Replace
                        the table, column, type and condition. Match the mask
                        types to the column.
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.rowLevelSecurity}
                    />
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.masking}
                    />
                    <Text size="sm" c="dimmed">
                        Do not give ai_agents superuser, IGNORE RLS or
                        sys:secadmin rights. Check inherited and PUBLIC grants.
                        Everyone shares this account's access. Check policy
                        settings and limits for external and shared tables.
                    </Text>
                </Stack>
            }
            addHelp="Enter the ai_agents user and its password, then select Test."
        />
    );
};
