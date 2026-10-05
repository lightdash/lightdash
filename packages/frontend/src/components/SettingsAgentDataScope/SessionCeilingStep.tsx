import { Stack, Text } from '@mantine/core';
import { SqlPanel } from './SqlPanel';
export const SessionCeilingStep = ({
    sql,
    aiIdentitiesEnabled,
}: {
    sql: string;
    aiIdentitiesEnabled: boolean;
}) => (
    <Stack gap="sm">
        {sql ? (
            <SqlPanel
                sql={sql}
                filename="ai-session-policy.sql"
                summary={
                    aiIdentitiesEnabled
                        ? 'Creates a read-only session scope and attaches its session policy to each named AI identity in this project.'
                        : 'Creates a read-only session scope and attaches its session policy to the Snowflake account.'
                }
            />
        ) : (
            <Text size="sm" c="dimmed">
                Choose a tag database and schema in Hide personal data from AI.
                {aiIdentitiesEnabled &&
                    ' Set up AI identity names in Organization settings to generate their policy assignments.'}
            </Text>
        )}
    </Stack>
);
