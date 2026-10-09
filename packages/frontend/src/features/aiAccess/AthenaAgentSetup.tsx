import {
    buildAthenaAiServiceAccountCommands,
    type AthenaCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const AthenaAgentSetup = ({
    connection,
    hasCredentials,
    tested,
}: {
    connection: AthenaCredentials;
    hasCredentials: boolean;
    tested: boolean;
}) => {
    const commands = buildAthenaAiServiceAccountCommands({
        region: connection.region,
        catalog: connection.database,
        database: connection.schema,
    });
    return (
        <AiServiceAccountSetupGuide
            warehouseName="Athena"
            hasAccount={hasCredentials}
            tested={tested}
            createContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Create an IAM role for agents with its own Athena
                        workgroup and S3 results location.
                    </Text>
                    <Text size="sm" fw={500}>
                        Role trust policy
                    </Text>
                    <CodeBlock
                        language="json"
                        copyLabel="Copy role trust policy"
                        code={commands.roleTrustPolicy}
                    />
                    <Text size="sm" c="dimmed">
                        Replace the placeholders. The trusted caller also needs
                        permission to assume the role.
                    </Text>
                    <Text size="sm" fw={500}>
                        Permission policy
                    </Text>
                    <CodeBlock
                        language="json"
                        copyLabel="Copy permission policy"
                        code={commands.permissionPolicy}
                    />
                    <Text size="sm" c="dimmed">
                        Attach this policy to the role. KMS keys and
                        cross-account catalogs need extra permissions.
                    </Text>
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Run as a Lake Formation administrator. Use the role ARN,
                        not the session ARN, and repeat for each permitted
                        table.
                    </Text>
                    <Text size="sm" fw={500}>
                        Lake Formation grant
                    </Text>
                    <CodeBlock
                        language="bash"
                        copyLabel="Copy Lake Formation grant"
                        code={commands.lakeFormationGrants}
                    />
                    <Text size="sm" c="dimmed">
                        To limit rows or columns, grant a data filter instead.
                        Other grants on the table can still allow more.
                    </Text>
                    <Text size="sm" fw={500}>
                        Filtered table grant
                    </Text>
                    <CodeBlock
                        language="bash"
                        copyLabel="Copy filtered table grant"
                        code={commands.filteredTableGrant}
                    />
                </Stack>
            }
            addHelp="Assume the role and add the session keys, workgroup and results location. Session keys expire, so replace them before they do. Test checks the AWS identity and runs a simple query."
        />
    );
};
