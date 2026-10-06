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
                <List.Item>
                    Read-only session checks and a masked-column probe.
                </List.Item>
            </List>
        </Stack>
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                Your Snowflake account controls access
            </Text>
            <List size="sm" spacing="xs">
                <List.Item>Your admin applies the SQL in Snowflake.</List.Item>
                <List.Item>
                    Your Snowflake grants and masking policies decide which data
                    AI can read.
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
                Views run with their owner’s rights. A session scope alone does
                not hide personal data. Apply masking to the underlying data.
            </List.Item>
            <List.Item>
                <Code>RESULT_SCAN</Code> may read earlier results from the same
                Snowflake user. Raw SQL from AI stays off until this check
                passes with a Restricted Session Scope active.
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
