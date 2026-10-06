import { Stack, Text } from '@mantine/core';
import { SqlPanel } from './SqlPanel';

export const SessionCeilingStep = ({ sql }: { sql: string }) => (
    <Stack gap="sm">
        <Text size="sm">
            The session scope does not cover views in allowed schemas that read
            excluded schemas. Masking covers them.
        </Text>
        <Text size="sm">
            Copies of personal data outside the protected schemas are not
            protected. Keep personal data only in protected, masked schemas.
        </Text>
        <Text size="sm">
            The session scope does not block RESULT_SCAN from reading the same
            person's earlier query results.
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
