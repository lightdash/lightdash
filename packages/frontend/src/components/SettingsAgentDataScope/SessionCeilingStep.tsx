import { Stack, Text } from '@mantine/core';
import { SqlPanel } from './SqlPanel';

export const SessionCeilingStep = ({ sql }: { sql: string }) => (
    <Stack gap="sm">
        {sql ? (
            <SqlPanel
                sql={sql}
                filename="ai-session-policy.sql"
                summary="Creates a read-only Restricted Session Scope and sets its session policy on the Snowflake account."
            />
        ) : (
            <Text size="sm" c="dimmed">
                Choose a tag database and schema in Hide personal data from AI.
            </Text>
        )}
    </Stack>
);
