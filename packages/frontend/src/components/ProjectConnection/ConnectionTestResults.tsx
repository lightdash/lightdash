import {
    assertUnreachable,
    WAREHOUSE_CONNECTION_HOP_LABELS,
    type WarehouseConnectionHop,
    type WarehouseConnectionTestResults,
} from '@lightdash/common';
import { Group, Paper, Stack, Text } from '@mantine/core';
import {
    IconCircleCheck,
    IconCircleDashed,
    IconCircleX,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

const HopIcon: FC<{ status: WarehouseConnectionHop['status'] }> = ({
    status,
}) => {
    switch (status) {
        case 'ok':
            return <MantineIcon icon={IconCircleCheck} color="green" />;
        case 'failed':
            return <MantineIcon icon={IconCircleX} color="red" />;
        case 'skipped':
            return <MantineIcon icon={IconCircleDashed} color="ldGray.5" />;
        default:
            return assertUnreachable(status, 'Unknown hop status');
    }
};

const ConnectionTestResults: FC<{
    results: WarehouseConnectionTestResults;
}> = ({ results }) => (
    <Paper p="md" withBorder>
        <Stack gap="xs">
            <Text fw={600}>
                {results.ok
                    ? 'Connection test passed'
                    : 'Connection test failed'}
            </Text>
            {results.hops.map((hop) => (
                <Stack key={hop.stage} gap={2}>
                    <Group gap="xs" wrap="nowrap">
                        <HopIcon status={hop.status} />
                        <Text
                            fz="sm"
                            c={hop.status === 'skipped' ? 'dimmed' : undefined}
                        >
                            {WAREHOUSE_CONNECTION_HOP_LABELS[hop.stage]}
                            {hop.status === 'skipped' ? ' (not run)' : ''}
                        </Text>
                    </Group>
                    {hop.message && (
                        <Text fz="sm" c="red" pl="xl">
                            {hop.message}
                        </Text>
                    )}
                </Stack>
            ))}
        </Stack>
    </Paper>
);

export default ConnectionTestResults;
