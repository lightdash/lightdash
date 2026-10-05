import { type SnowflakeAiBoundaryCheck } from '@lightdash/common';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';

const CHECK_TITLES: Record<SnowflakeAiBoundaryCheck['id'], string> = {
    agent_active: 'Agent session and session scope',
    masked_column: 'Protected column is masked',
    result_scan_blocked: 'Earlier results are blocked',
    secondary_roles_blocked: 'Secondary roles are blocked',
};
const OUTCOMES: Record<
    SnowflakeAiBoundaryCheck['status'],
    { label: string; color: string }
> = {
    pass: { label: 'Pass', color: 'green' },
    fail: { label: 'Fail', color: 'red' },
    skipped: { label: 'Not run', color: 'gray' },
    covered: { label: 'Covered by Lightdash', color: 'blue' },
    not_covered: { label: 'Not covered', color: 'yellow' },
};
const FIX_DESTINATIONS = {
    2: { section: 'oauth', title: 'Snowflake OAuth sign-in' },
    3: { section: 'masking', title: 'Hide personal data' },
    4: { section: 'session_policy', title: 'Limit AI sessions' },
    5: { section: 'identities', title: 'AI identities' },
    7: { section: 'restrictions', title: 'AI access restrictions' },
} as const;

export const TestResults = ({
    checks,
    onFix,
    aiIdentitiesEnabled,
}: {
    checks: SnowflakeAiBoundaryCheck[];
    onFix: (section: string) => void;
    aiIdentitiesEnabled: boolean;
}) => (
    <Stack gap="md">
        {checks.map((check) => {
            const outcome = OUTCOMES[check.status];
            const destination =
                aiIdentitiesEnabled && check.fixStep === 2
                    ? FIX_DESTINATIONS[5]
                    : FIX_DESTINATIONS[check.fixStep];
            return (
                <Stack key={check.id} gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" fw={500}>
                            {CHECK_TITLES[check.id]}
                        </Text>
                        <Badge
                            size="sm"
                            color={outcome.color}
                            leftSection={
                                check.status === 'covered' ? (
                                    <MantineIcon
                                        icon={IconShieldCheck}
                                        size={14}
                                    />
                                ) : undefined
                            }
                        >
                            {outcome.label}
                        </Badge>
                    </Group>
                    <Text size="sm">{check.detail}</Text>
                    {check.status !== 'pass' && check.status !== 'covered' && (
                        <Group>
                            <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => onFix(destination.section)}
                            >
                                Fix: {destination.title}
                            </Button>
                        </Group>
                    )}
                </Stack>
            );
        })}
    </Stack>
);
