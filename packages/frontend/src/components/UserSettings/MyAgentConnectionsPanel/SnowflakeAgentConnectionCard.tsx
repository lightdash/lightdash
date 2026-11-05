import {
    AgentIdentityConnectEntryPoint,
    assertUnreachable,
    type UserWarehouseCredentialsWithAgentStatus,
} from '@lightdash/common';
import { Badge, Button, Paper, Text } from '@mantine/core';
import { useState } from 'react';
import {
    SnowflakeSignInPopupBlockedError,
    useSnowflakeAiLoginPopup,
} from '../../../hooks/useSnowflake';
import { SettingRow } from '../../common/Settings/SettingLayout';
import { DeleteCredentialsModal } from '../MyWarehouseConnectionsPanel/DeleteCredentialsModal';
import { formatAgentConnectionDate } from './formatAgentConnectionDate';
import {
    getSnowflakeAgentStatus,
    type SnowflakeAgentStatus,
} from './snowflakeAgentStatus';

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

const getSnowflakeAgentDescription = (
    status: SnowflakeAgentStatus,
    expiresAt: Date | null,
    now: number,
): string | null => {
    switch (status) {
        case 'connected':
            return expiresAt && new Date(expiresAt).getTime() > now
                ? `Your agent sign-in lasts until ${formatAgentConnectionDate(expiresAt)}.`
                : null;
        case 'expired':
            return `Your Snowflake agent sign-in ended${expiresAt && new Date(expiresAt).getTime() <= now ? ` on ${formatAgentConnectionDate(expiresAt)}` : ''}. Sign in again to keep using agents on Snowflake projects.`;
        case 'unavailable':
            return 'Agent sign-in is not set up yet. Ask an admin to finish the Snowflake setup.';
        case 'not_connected':
        case 'failing':
            return "Your agents can't run on Snowflake projects until you connect. It takes about 30 seconds.";
        default:
            return assertUnreachable(status, 'Unknown agent connection status');
    }
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
    if (status === 'connected')
        return allowDisconnect ? (
            <Button size="xs" variant="default" onClick={onDisconnect}>
                Disconnect
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
                (status === 'expired' ? 'Sign in again' : 'Connect agent')}
        </Button>
    );
};

type SnowflakeAgentConnectionProps = {
    credential: UserWarehouseCredentialsWithAgentStatus | null;
    snowflakeConfigured: boolean;
    projectUuid?: string | null;
    signInLabel?: string;
    statusOverride?: SnowflakeAgentStatus;
    allowDisconnect?: boolean;
};

export const SnowflakeAgentConnectionRow = ({
    credential,
    snowflakeConfigured,
    projectUuid = null,
    signInLabel,
    statusOverride,
    allowDisconnect = true,
}: SnowflakeAgentConnectionProps) => {
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
    const now = Date.now();
    const status =
        statusOverride ??
        getSnowflakeAgentStatus(
            credential,
            !!login.error && !isPopupBlocked,
            snowflakeConfigured,
        );
    const badge = getStatusBadge(status);
    const errorMessage = isPopupBlocked
        ? 'Your browser blocked the Snowflake sign-in window. Allow pop-ups for this site, then try again.'
        : (login.error?.message ?? null);
    return (
        <>
            <SettingRow
                title="Snowflake"
                description={getSnowflakeAgentDescription(
                    status,
                    credential?.expiresAt ?? null,
                    now,
                )}
                titleAddon={
                    <Badge size="sm" color={badge.color}>
                        {badge.label}
                    </Badge>
                }
                control={
                    <SnowflakeConnectionAction
                        status={status}
                        allowDisconnect={allowDisconnect}
                        signInLabel={signInLabel}
                        onDisconnect={() => setIsRemoving(true)}
                        login={login}
                    />
                }
            >
                {status !== 'unavailable' && errorMessage && (
                    <Text c="red" fz="xs" mt="xs" role="alert">
                        {errorMessage}
                    </Text>
                )}
            </SettingRow>
            {status !== 'unavailable' && credential && isRemoving && (
                <DeleteCredentialsModal
                    opened={isRemoving}
                    onClose={() => setIsRemoving(false)}
                    warehouseCredentialsToBeDeleted={credential}
                />
            )}
        </>
    );
};

export const SnowflakeAgentConnectionCard = (
    props: SnowflakeAgentConnectionProps,
) => (
    <Paper p="md">
        <SnowflakeAgentConnectionRow {...props} />
    </Paper>
);
