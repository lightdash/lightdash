import {
    AiIdentityFailureReason,
    AiIdentityState,
    type AiIdentity,
} from '@lightdash/common';
import { Badge, Stack, Text, Tooltip } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCircleCheck,
    IconClock,
    IconLogin,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';

const reasonLabels: Record<AiIdentityFailureReason, string> = {
    [AiIdentityFailureReason.KEY_OR_USER_REJECTED]: 'Rejected by Snowflake',
    [AiIdentityFailureReason.NOT_SERVICE_AGENT]: 'Not a service agent',
    [AiIdentityFailureReason.WRONG_USER]: 'Wrong user',
    [AiIdentityFailureReason.WAREHOUSE_ACCESS]: 'Warehouse access',
    [AiIdentityFailureReason.DISABLED_OR_LOCKED]: 'Disabled or locked',
    [AiIdentityFailureReason.NETWORK_POLICY]: 'Network policy',
    [AiIdentityFailureReason.UNKNOWN]: 'Check failed',
};

const statusPresentation = (identity: AiIdentity) => {
    if (identity.state === AiIdentityState.FAILED) {
        return {
            label: identity.failureReason
                ? reasonLabels[identity.failureReason]
                : 'Failed',
            color: 'red',
        };
    }
    if (identity.state === AiIdentityState.NEEDS_SIGN_IN) {
        return { label: 'Needs sign-in', color: 'orange' };
    }
    if (identity.state === AiIdentityState.PENDING) {
        return identity.stale
            ? { label: 'Pending 7+ days', color: 'orange' }
            : { label: 'Pending', color: 'gray' };
    }
    return { label: 'Ready', color: 'green' };
};

export const AiIdentityStatusBadge: FC<{ identity: AiIdentity }> = ({
    identity,
}) => {
    const { label, color } = statusPresentation(identity);
    const badge = <Badge color={color}>{label}</Badge>;
    return identity.statusMessage ? (
        <Tooltip label={identity.statusMessage} multiline maw={400}>
            {badge}
        </Tooltip>
    ) : (
        badge
    );
};

const statusIcons: Record<AiIdentityState, Icon> = {
    [AiIdentityState.READY]: IconCircleCheck,
    [AiIdentityState.PENDING]: IconClock,
    [AiIdentityState.FAILED]: IconAlertTriangle,
    [AiIdentityState.NEEDS_SIGN_IN]: IconLogin,
};

export const AiIdentityStatusIcon: FC<{ identity: AiIdentity }> = ({
    identity,
}) => {
    const { label, color } = statusPresentation(identity);
    const StatusIcon = statusIcons[identity.state];
    return (
        <Tooltip
            multiline
            maw={400}
            withinPortal
            label={
                <Stack gap={2}>
                    <Text fz="xs" fw={600}>
                        {label}
                    </Text>
                    {identity.statusMessage && (
                        <Text fz="xs">{identity.statusMessage}</Text>
                    )}
                </Stack>
            }
        >
            <StatusIcon
                size={18}
                aria-label={label}
                color={`var(--mantine-color-${color}-6)`}
            />
        </Tooltip>
    );
};
