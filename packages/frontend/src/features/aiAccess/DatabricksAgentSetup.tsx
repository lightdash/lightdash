import {
    buildDatabricksAiServiceAccountCommands,
    type DatabricksCredentials,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import { AiServiceAccountSetupGuide } from './AiServiceAccountSetupGuide';

export const DatabricksAgentSetup = ({
    connection,
    hasCredentials,
    tested,
}: {
    connection: DatabricksCredentials;
    hasCredentials: boolean;
    tested: boolean;
}) => (
    <AiServiceAccountSetupGuide
        warehouseName="Databricks"
        hasAccount={hasCredentials}
        tested={tested}
        createContent={
            <Text size="sm" c="dimmed">
                Create a service principal and an OAuth secret in the Databricks
                account console. Add it to the workspace and give it CAN USE on
                the SQL warehouse.
            </Text>
        }
        grantContent={
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
                    Replace the placeholders and repeat SELECT for each
                    permitted table or view. Unity Catalog row filters and
                    column masks apply to this principal. Grant only the data
                    every agent user may see.
                </Text>
            </Stack>
        }
        addHelp="Use the service principal's application ID as the Client ID."
    />
);
