import { type SnowflakeAiBoundaryCheck } from '@lightdash/common';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';

const CHECK_TITLES: Record<SnowflakeAiBoundaryCheck['id'], string> = {
    agent_active: 'Agent session and session scope',
    masked_column: 'Protected column is masked',
    result_scan_blocked: 'Earlier results are blocked',
    secondary_roles_blocked: 'Secondary roles are blocked',
};

export const TestResults = ({
    checks,
    error,
    onFix,
}: {
    checks: SnowflakeAiBoundaryCheck[] | null;
    error: string;
    onFix: (step: number) => void;
}) => (
    <>
        {error && (
            <Text c="red" fz="sm">
                {error}
            </Text>
        )}
        {checks?.map((check) => (
            <Stack key={check.id} gap="xs">
                <Group gap="xs">
                    <Text fz="sm" fw={600}>
                        {CHECK_TITLES[check.id]}
                    </Text>
                    <Badge
                        size="sm"
                        color={
                            check.status === 'pass'
                                ? 'green'
                                : check.status === 'fail'
                                  ? 'red'
                                  : 'gray'
                        }
                    >
                        {check.status === 'pass'
                            ? 'Pass'
                            : check.status === 'fail'
                              ? 'Fail'
                              : 'Skipped'}
                    </Badge>
                </Group>
                <Text fz="sm">{check.detail}</Text>
                {check.status === 'fail' && (
                    <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => onFix(check.fixStep - 1)}
                    >
                        Go to step {check.fixStep}
                    </Button>
                )}
            </Stack>
        ))}
    </>
);
