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
                        Create an Athena workgroup and an S3 results location
                        for agents.
                    </Text>
                    <Text size="sm" c="dimmed">
                        Use a dedicated IAM user for agents, with only the
                        permissions agents need, and rotate its keys regularly.
                        Keys from an assumed role expire within hours and
                        Lightdash can't renew them yet, so agents would be
                        refused until you paste new keys.
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
                        Attach this policy to the IAM user. KMS keys and
                        cross-account catalogs need extra permissions.
                    </Text>
                    <Text size="sm" fw={500}>
                        Role trust policy (optional)
                    </Text>
                    <Text size="sm" c="dimmed">
                        If you rotate keys automatically, you can use an IAM
                        role instead. Attach the permission policy to the role
                        and use this trust policy. The trusted caller also needs
                        permission to assume the role.
                    </Text>
                    <CodeBlock
                        language="json"
                        copyLabel="Copy role trust policy"
                        code={commands.roleTrustPolicy}
                    />
                </Stack>
            }
            grantContent={
                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Run as a Lake Formation administrator. Use the IAM user
                        ARN, or the role ARN and not the session ARN. Repeat for
                        each permitted table.
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
            addHelp="Add the access keys, workgroup and results location. Test checks the AWS identity and runs a simple query."
        />
    );
};
