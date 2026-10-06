import { Stack, Text, TextInput } from '@mantine/core';
import { IntegrationEnvironment } from './IntegrationEnvironment';
import { SqlPanel } from './SqlPanel';
export const IntegrationStep = ({
    integrationName,
    setIntegrationName,
    roles,
    setRoles,
    sql,
    cloud,
    account,
    envBlock,
    enabled,
}: {
    integrationName: string;
    setIntegrationName: (value: string) => void;
    roles: string;
    setRoles: (value: string) => void;
    sql: string;
    cloud: boolean;
    account: string;
    envBlock: string;
    enabled: boolean;
}) => (
    <Stack gap="sm">
        <TextInput
            label="Integration name"
            value={integrationName}
            onChange={(event) => setIntegrationName(event.currentTarget.value)}
        />
        <TextInput
            label="Pre-authorized roles"
            description="Separate role names with commas"
            value={roles}
            onChange={(event) => setRoles(event.currentTarget.value)}
        />
        {sql ? (
            <SqlPanel
                sql={sql}
                summary="Creates the Snowflake OAuth integration for AI and shows its client credentials for your deployment admin."
            />
        ) : (
            <Text c="dimmed" fz="sm">
                Enter a valid integration name and at least one role.
            </Text>
        )}
        <IntegrationEnvironment
            cloud={cloud}
            account={account}
            envBlock={envBlock}
        />
        <Text fz="sm">
            {enabled
                ? 'AI sign-in is configured.'
                : 'Configure the credentials and restart the server to complete this step.'}
        </Text>
    </Stack>
);
