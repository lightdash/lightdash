import { Code, List, SimpleGrid, Stack, Text } from '@mantine/core';
import Callout from '../common/Callout';

export const GuideOverview = () => (
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                Lightdash does
            </Text>
            <List size="sm" spacing="xs">
                <List.Item>Generate SQL for you to review and run.</List.Item>
                <List.Item>
                    Connect as each person’s AI identity when AI identities are
                    enabled.
                </List.Item>
                <List.Item>
                    Run read-only session checks and a masked-column probe.
                </List.Item>
            </List>
        </Stack>
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                Lightdash never does
            </Text>
            <List size="sm" spacing="xs">
                <List.Item>
                    Run DDL or GRANTs in your Snowflake account.
                </List.Item>
                <List.Item>
                    Use a shared warehouse sign-in as a fallback while
                    restrictions are on.
                </List.Item>
            </List>
            <Text size="sm" c="dimmed">
                Your Snowflake grants and masking policies decide which data AI
                can read. A ready AI identity confirms sign-in, not data
                masking.
            </Text>
        </Stack>
    </SimpleGrid>
);
export const GuideLimitations = () => (
    <Callout variant="warning" title="What this does not cover">
        <List size="sm" spacing="xs">
            <List.Item>
                Views run with their owner’s rights. A session scope alone does
                not hide personal data; apply masking to the underlying data.
            </List.Item>
            <List.Item>
                Earlier results: <Code>RESULT_SCAN</Code> can read results from
                the same Snowflake user. On the legacy OAuth path, restrictions
                turn off raw SQL from AI. With AI identities, run checks to
                verify that your AI identity cannot read your personal results.
            </List.Item>
            <List.Item>
                A user’s session policy replaces the account policy. Review
                users with their own policy and attach the policy to each AI
                identity.
            </List.Item>
            <List.Item>
                A successful masked-column probe verifies one column at the time
                of the check. Review every protected schema after changing your
                Snowflake policies.
            </List.Item>
        </List>
    </Callout>
);
