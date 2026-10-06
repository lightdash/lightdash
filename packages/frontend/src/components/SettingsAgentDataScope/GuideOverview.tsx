import { Code, List, SimpleGrid, Stack, Text } from '@mantine/core';
import Callout from '../common/Callout';

export const GuideOverview = () => (
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                This guide shows
            </Text>
            <List size="sm" spacing="xs">
                <List.Item>
                    SQL for your Snowflake admin to review and run.
                </List.Item>
                <List.Item>
                    How each person signs in to Snowflake for AI.
                </List.Item>
                <List.Item>Masking checks and session scope checks.</List.Item>
            </List>
        </Stack>
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                Your Snowflake account controls access
            </Text>
            <List size="sm" spacing="xs">
                <List.Item>Your admin applies the SQL in Snowflake.</List.Item>
                <List.Item>
                    Tag-based masking policies check IS_AGENT_ACTIVATED. They
                    mask the data itself for AI sessions.
                </List.Item>
                <List.Item>
                    The session scope adds a second layer. It limits data reads,
                    warehouse use and role switching.
                </List.Item>
                <List.Item>
                    Each AI query uses the person’s Snowflake sign-in for AI.
                </List.Item>
            </List>
        </Stack>
    </SimpleGrid>
);

export const GuideLimitations = () => (
    <Callout variant="warning" title="What this does not cover">
        <List size="sm" spacing="xs">
            <List.Item>
                The session scope does not cover views in allowed schemas that
                read excluded schemas. Masking covers them.
            </List.Item>
            <List.Item>
                Copies of personal data outside the protected schemas are not
                protected. Keep personal data only in protected, masked schemas.
            </List.Item>
            <List.Item>
                The session scope does not block <Code>RESULT_SCAN</Code> from
                reading the same person's earlier query results.
            </List.Item>
            <List.Item>
                A user’s session policy replaces the account policy. Review
                users who have their own policy.
            </List.Item>
            <List.Item>
                A successful masked-column probe verifies one column at the time
                of the check. Review every protected schema after changing your
                Snowflake policies.
            </List.Item>
        </List>
    </Callout>
);
