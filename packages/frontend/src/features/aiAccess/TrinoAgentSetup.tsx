import {
    buildTrinoAiServiceAccountCommands,
    type TrinoCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

interface TrinoAgentSetupProps {
    connection: TrinoCredentials;
    hasCredentials: boolean;
    tested: boolean;
}

export const TrinoAgentSetup = ({
    connection,
    hasCredentials,
    tested,
}: TrinoAgentSetupProps) => {
    const commands = buildTrinoAiServiceAccountCommands(connection);
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Trino"
            hasAccount={hasCredentials}
            tested={tested}
            createTitle="Create or choose the Trino login"
            grantTitle="Limit what the login can read"
            addTitle="Enter the user and password"
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Trino has no CREATE USER. Ask an admin to add a user to
                        the password file or LDAP. Turn on password
                        authentication over HTTPS. Without it, Trino does not
                        check the password.
                    </Text>
                    <Text size="sm" c="dimmed">
                        On Starburst Galaxy, create a service account with a
                        restricted role. Use its user name and generated
                        password to sign in with basic authentication.
                    </Text>
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        File-based access control (rules.json)
                    </Text>
                    <Text size="sm" c="dimmed">
                        Set access-control.name=file and point
                        security.config-file to rules.json. Merge these rules
                        above broader rules. Rules match from top to bottom; the
                        first match wins. Use the effective user shown by Test
                        if your authenticator maps the login to another user.
                    </Text>
                    <CodeBlock
                        language="json"
                        copyLabel="Copy rules.json"
                        code={commands.accessControlRules}
                    />
                    <Text size="sm" c="dimmed">
                        Replace the user, table and policy placeholders. The
                        filter and columns fields are optional: remove them or
                        supply a row filter and a column mask expression with
                        the right column type. Names in rules are regex
                        literals; escape regex characters in replacements.
                    </Text>
                    <Text size="sm" fw={500}>
                        SQL roles and grants
                    </Text>
                    <Text size="sm" c="dimmed">
                        Use this alternative only with system access control
                        that supports SQL roles and grants. Connector roles,
                        such as Hive roles, need IN "&lt;catalog&gt;" on CREATE
                        ROLE and the role grant. Check inherited and public
                        grants.
                    </Text>
                    <CodeBlock
                        language="sql"
                        copyLabel="Copy SQL"
                        code={commands.grantReadAccess}
                    />
                </Stack>
            }
            addHelp="Enter the user and password, then select Test. Everyone using agents shares this login's access. Test checks the sign-in, not every grant."
        />
    );
};
