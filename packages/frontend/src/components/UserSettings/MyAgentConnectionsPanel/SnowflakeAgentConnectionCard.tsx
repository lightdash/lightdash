import {
    AgentIdentityConnectEntryPoint,
    assertUnreachable,
    FeatureFlags,
    type UserWarehouseCredentialsWithAgentStatus,
} from '@lightdash/common';
import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    SnowflakeSignInPopupBlockedError,
    useSnowflakeAiLoginPopup,
} from '../../../hooks/useSnowflake';
import { DeleteCredentialsModal } from '../MyWarehouseConnectionsPanel/DeleteCredentialsModal';
import { formatAgentConnectionDate } from './formatAgentConnectionDate';
import {
    getSnowflakeAgentStatus,
    type SnowflakeAgentStatus,
} from './snowflakeAgentStatus';
import { useExpiryTimer } from './useExpiryTimer';

const getStatusBadge = (status: SnowflakeAgentStatus) => {
    switch (status) {
        case 'unavailable':
            return { label: 'Not available', color: 'gray' };
        case 'not_connected':
            return { label: 'Not connected', color: 'gray' };
        case 'connected':
            return {
                label: 'Connected',
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

const SnowflakeAgentConnectionDetails = ({
    status,
    expiresAt,
    now,
    errorMessage,
}: {
    status: SnowflakeAgentStatus;
    expiresAt: Date | null;
    now: number;
    errorMessage: string | null;
}) => (
    <>
        {status === 'connected' &&
        expiresAt &&
        new Date(expiresAt).getTime() > now ? (
            <Text c="dimmed" fz="sm">
                Your agent sign-in lasts until{' '}
                {formatAgentConnectionDate(expiresAt)}.
            </Text>
        ) : null}
        {status === 'expired' && (
            <Text c="dimmed" fz="sm">
                {`Your Snowflake agent sign-in ended${expiresAt && new Date(expiresAt).getTime() <= now ? ` on ${formatAgentConnectionDate(expiresAt)}` : ''}. Sign in again to keep using agents on Snowflake projects.`}
            </Text>
        )}
        {status !== 'connected' && status !== 'expired' && (
            <Text c="dimmed" fz="sm">
                {status === 'unavailable'
                    ? 'Agent sign-in is not set up yet. Ask an admin to finish the Snowflake setup.'
                    : 'Your AI questions on Snowflake projects are refused until you connect. Takes about 30 seconds.'}
            </Text>
        )}
        {status !== 'unavailable' && errorMessage && (
            <Text c="red" fz="sm" role="alert">
                {errorMessage}
            </Text>
        )}
    </>
);

export const SnowflakeAgentConnectionCard = ({
    credential,
    snowflakeConfigured,
}: {
    credential: UserWarehouseCredentialsWithAgentStatus | null;
    snowflakeConfigured: boolean;
}) => {
    const { data: silentRefreshFlag } = useServerFeatureFlag(
        FeatureFlags.AgentIdentitySilentRefresh,
    );
    const silentRefreshEnabled = silentRefreshFlag?.enabled ?? false;
    const login = useSnowflakeAiLoginPopup(
        {
            entryPoint: AgentIdentityConnectEntryPoint.MY_AGENT_CONNECTIONS,
            projectUuid: null,
        },
        { showErrorToast: false },
    );
    const isPopupBlocked =
        !!login.error &&
        login.error instanceof SnowflakeSignInPopupBlockedError;
    const [isRemoving, setIsRemoving] = useState(false);
    useExpiryTimer(
        !silentRefreshEnabled && credential?.expiresAt
            ? new Date(credential.expiresAt).getTime()
            : null,
    );
    const now = Date.now();
    const status = getSnowflakeAgentStatus(
        credential,
        !!login.error && !isPopupBlocked,
        now,
        snowflakeConfigured,
        silentRefreshEnabled,
    );
    const badge = getStatusBadge(status);
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
                            onClick={() => {
                                login.reset();
                                login.mutate();
                            }}
                            loading={login.isLoading}
                        >
                            {status === 'expired'
                                ? 'Sign in again'
                                : 'Connect agent'}
                        </Button>
                    ) : null}
                </Group>
                <SnowflakeAgentConnectionDetails
                    status={status}
                    expiresAt={credential?.expiresAt ?? null}
                    now={now}
                    errorMessage={
                        isPopupBlocked
                            ? 'Your browser blocked the Snowflake sign-in window. Allow pop-ups for this site, then try again.'
                            : (login.error?.message ?? null)
                    }
                />
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
