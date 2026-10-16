import {
    AgentIdentityConnectEntryPoint,
    assertUnreachable,
    FeatureFlags,
    type UserWarehouseCredentialsWithAgentStatus,
} from '@lightdash/common';
import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { type TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const getStatusBadge = (t: TFunction, status: SnowflakeAgentStatus) => {
    switch (status) {
        case 'unavailable':
            return {
                label: t(
                    'myAgentConnectionsPanel.snowflakeAgentConnectionCard.status.unavailable',
                ),
                color: 'gray',
            };
        case 'not_connected':
            return {
                label: t(
                    'myAgentConnectionsPanel.snowflakeAgentConnectionCard.status.notConnected',
                ),
                color: 'gray',
            };
        case 'connected':
            return {
                label: t(
                    'myAgentConnectionsPanel.snowflakeAgentConnectionCard.status.connected',
                ),
                color: 'green',
            };
        case 'expired':
            return {
                label: t(
                    'myAgentConnectionsPanel.snowflakeAgentConnectionCard.status.expired',
                ),
                color: 'orange',
            };
        case 'failing':
            return {
                label: t(
                    'myAgentConnectionsPanel.snowflakeAgentConnectionCard.status.failing',
                ),
                color: 'red',
            };
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
}) => {
    const { t } = useTranslation('userSettings');
    return (
        <>
            {status === 'connected' &&
            expiresAt &&
            new Date(expiresAt).getTime() > now ? (
                <Text c="dimmed" fz="sm">
                    {t(
                        'myAgentConnectionsPanel.snowflakeAgentConnectionCard.connectedUntil',
                        {
                            date: formatAgentConnectionDate(expiresAt),
                        },
                    )}
                </Text>
            ) : null}
            {status === 'expired' && (
                <Text c="dimmed" fz="sm">
                    {expiresAt && new Date(expiresAt).getTime() <= now
                        ? t(
                              'myAgentConnectionsPanel.snowflakeAgentConnectionCard.expiredOn',
                              {
                                  date: formatAgentConnectionDate(expiresAt),
                              },
                          )
                        : t(
                              'myAgentConnectionsPanel.snowflakeAgentConnectionCard.expired',
                          )}
                </Text>
            )}
            {status !== 'connected' && status !== 'expired' && (
                <Text c="dimmed" fz="sm">
                    {status === 'unavailable'
                        ? t(
                              'myAgentConnectionsPanel.snowflakeAgentConnectionCard.unavailable',
                          )
                        : t(
                              'myAgentConnectionsPanel.snowflakeAgentConnectionCard.notConnected',
                          )}
                </Text>
            )}
            {status !== 'unavailable' && errorMessage && (
                <Text c="red" fz="sm" role="alert">
                    {errorMessage}
                </Text>
            )}
        </>
    );
};

const SnowflakeConnectionAction = ({
    status,
    allowDisconnect,
    signInLabel,
    onDisconnect,
    login,
}: {
    status: SnowflakeAgentStatus;
    allowDisconnect: boolean;
    signInLabel: string | undefined;
    onDisconnect: () => void;
    login: ReturnType<typeof useSnowflakeAiLoginPopup>;
}) => {
    const { t } = useTranslation('userSettings');
    if (status === 'connected')
        return allowDisconnect ? (
            <Button size="xs" variant="default" onClick={onDisconnect}>
                {t(
                    'myAgentConnectionsPanel.snowflakeAgentConnectionCard.disconnect',
                )}
            </Button>
        ) : null;
    if (status === 'unavailable') return null;
    return (
        <Button
            size="xs"
            onClick={() => {
                login.reset();
                login.mutate();
            }}
            loading={login.isLoading}
        >
            {signInLabel ??
                (status === 'expired'
                    ? t(
                          'myAgentConnectionsPanel.snowflakeAgentConnectionCard.signInAgain',
                      )
                    : t(
                          'myAgentConnectionsPanel.snowflakeAgentConnectionCard.connectAgent',
                      ))}
        </Button>
    );
};

export const SnowflakeAgentConnectionCard = ({
    credential,
    snowflakeConfigured,
    projectUuid = null,
    signInLabel,
    statusOverride,
    allowDisconnect = true,
}: {
    credential: UserWarehouseCredentialsWithAgentStatus | null;
    snowflakeConfigured: boolean;
    projectUuid?: string | null;
    signInLabel?: string;
    statusOverride?: SnowflakeAgentStatus;
    allowDisconnect?: boolean;
}) => {
    const { t } = useTranslation('userSettings');
    const { data: silentRefreshFlag } = useServerFeatureFlag(
        FeatureFlags.AgentIdentitySilentRefresh,
    );
    const silentRefreshEnabled = silentRefreshFlag?.enabled ?? false;
    const login = useSnowflakeAiLoginPopup(
        {
            entryPoint: AgentIdentityConnectEntryPoint.MY_AGENT_CONNECTIONS,
            projectUuid,
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
    const status =
        statusOverride ??
        getSnowflakeAgentStatus(
            credential,
            !!login.error && !isPopupBlocked,
            now,
            snowflakeConfigured,
            silentRefreshEnabled,
        );
    const badge = getStatusBadge(t, status);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Group justify="space-between">
                    <Group gap="sm">
                        <Title order={5}>Snowflake</Title>
                        <Badge color={badge.color}>{badge.label}</Badge>
                    </Group>
                    <SnowflakeConnectionAction
                        status={status}
                        allowDisconnect={allowDisconnect}
                        signInLabel={signInLabel}
                        onDisconnect={() => setIsRemoving(true)}
                        login={login}
                    />
                </Group>
                <SnowflakeAgentConnectionDetails
                    status={status}
                    expiresAt={credential?.expiresAt ?? null}
                    now={now}
                    errorMessage={
                        isPopupBlocked
                            ? t(
                                  'myAgentConnectionsPanel.snowflakeAgentConnectionCard.popupBlocked',
                              )
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
