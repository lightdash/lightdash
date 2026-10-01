import {
    parseEgressIps,
    WAREHOUSE_EGRESS_IP_CONTROL,
    WarehouseTypes,
} from '@lightdash/common';
import { Code, Group, Paper, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import useApp from '../../providers/App/useApp';
import { CopyActionIcon } from '../common/CopyActionIcon';

const SNOWFLAKE_CLI_NOTE =
    'If you connect through the Lightdash CLI, the token bypasses your network policy for the next 60 minutes so the connection can be verified. Allowlist these addresses to keep it working afterwards.';

export const EgressIpNotice: FC<{ warehouseType: WarehouseTypes }> = ({
    warehouseType,
}) => {
    const { health } = useApp();
    const ips = parseEgressIps(health.data?.staticIp);
    const control = WAREHOUSE_EGRESS_IP_CONTROL[warehouseType];
    if (ips.length === 0 || control === null) return null;

    return (
        <Paper p="sm">
            <Stack gap="xs">
                <Text size="sm" fw={500}>
                    Lightdash connects from{' '}
                    {ips.length === 1
                        ? 'this IP address'
                        : 'these IP addresses'}
                </Text>
                <Group gap="xs">
                    {ips.map((ip) => (
                        <Code key={ip}>{ip}</Code>
                    ))}
                    <CopyActionIcon
                        value={ips.join(', ')}
                        copyLabel="Copy IP addresses"
                        variant="subtle"
                    />
                </Group>
                <Text size="sm" c="dimmed">
                    {control}
                    {warehouseType === WarehouseTypes.SNOWFLAKE &&
                        ` ${SNOWFLAKE_CLI_NOTE}`}
                </Text>
            </Stack>
        </Paper>
    );
};
