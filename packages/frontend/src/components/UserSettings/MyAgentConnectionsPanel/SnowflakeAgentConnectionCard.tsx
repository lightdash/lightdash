import {
    AgentIdentityConnectEntryPoint,
    assertUnreachable,
    formatDate,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useSnowflakeAiLoginPopup } from '../../../hooks/useSnowflake';
import { DeleteCredentialsModal } from '../MyWarehouseConnectionsPanel/DeleteCredentialsModal';
import {
    getSnowflakeAgentStatus,
    type SnowflakeAgentStatus,
} from './snowflakeAgentStatus';
import { useExpiryTimer } from './useExpiryTimer';

const getStatusBadge = (
    status: SnowflakeAgentStatus,
    expiresAt: Date | null,
) => {
    switch (status) {
        case 'unavailable':
            return { label: 'Not available', color: 'gray' };
        case 'not_connected':
            return { label: 'Not connected', color: 'gray' };
        case 'connected':
            return {
                label: expiresAt
                    ? `Connected until ${formatDate(expiresAt)}`
                    : 'Connected',
                color: 'green',
            };
        case 'expired':
            return { label: 'Expired', color: 'orange' };
        case 'failing':
            return { label: 'Failing', color: 'red' };
        default:
            return assertUnreachable(status, 'Unknown agent connection status');
    }
};

export const SnowflakeAgentConnectionCard = ({
    credential,
    snowflakeConfigured,
}: {
    credential: UserWarehouseCredentials | null;
    snowflakeConfigured: boolean;
}) => {
    const login = useSnowflakeAiLoginPopup({
        entryPoint: AgentIdentityConnectEntryPoint.MY_AGENT_CONNECTIONS,
        projectUuid: null,
    });
    const [isRemoving, setIsRemoving] = useState(false);
    useExpiryTimer(
        credential?.expiresAt ? new Date(credential.expiresAt).getTime() : null,
    );
    const status = getSnowflakeAgentStatus(
        credential,
        !!login.error,
        Date.now(),
        snowflakeConfigured,
    );
    const badge = getStatusBadge(status, credential?.expiresAt ?? null);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Group justify="space-between">
                    <Group gap="sm">
                        <Title order={5}>Snowflake</Title>
                        <Badge color={badge.color}>{badge.label}</Badge>
                    </Group>
                    {status === 'connected' ? (
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => setIsRemoving(true)}
                        >
                            Disconnect
                        </Button>
                    ) : status !== 'unavailable' ? (
                        <Button
                            size="xs"
                            onClick={() => login.mutate()}
                            loading={login.isLoading}
                        >
                            Connect agent
                        </Button>
                    ) : null}
                </Group>
                {status !== 'connected' && (
                    <Text c="dimmed" fz="sm">
                        {status === 'unavailable'
                            ? 'Agent sign-in is not set up yet. Ask an admin to finish the Snowflake setup.'
                            : 'Your AI questions on Snowflake projects are refused until you connect. Takes about 30 seconds.'}
                    </Text>
                )}
                {status === 'failing' && login.error && (
                    <Text c="red" fz="sm" role="alert">
                        {login.error.message}
                    </Text>
                )}
            </Stack>
            {status !== 'unavailable' && credential && isRemoving && (
                <DeleteCredentialsModal
                    opened={isRemoving}
                    onClose={() => setIsRemoving(false)}
                    warehouseCredentialsToBeDeleted={credential}
                />
            )}
        </Paper>
    );
};
