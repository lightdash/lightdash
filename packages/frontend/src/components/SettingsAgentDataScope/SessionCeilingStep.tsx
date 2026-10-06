import { Stack, Text } from '@mantine/core';
import { SqlPanel } from './SqlPanel';

export const SessionCeilingStep = ({ sql }: { sql: string }) => (
    <Stack gap="sm">
        <Text size="sm">
            The session scope does not stop a view in an allowed schema from
            reading an excluded schema. Mask the data itself.
        </Text>
        {sql ? (
            <SqlPanel
                sql={sql}
                filename="ai-session-policy.sql"
                summary="Creates a Restricted Session Scope for data reads and warehouse use. It blocks role switching and sets the session policy on the Snowflake account."
            />
        ) : (
            <Text size="sm" c="dimmed">
                Choose a tag database and schema in Hide personal data from AI.
            </Text>
        )}
    </Stack>
);
