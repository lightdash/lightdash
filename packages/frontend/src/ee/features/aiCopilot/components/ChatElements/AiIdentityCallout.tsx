import { subject } from '@casl/ability';
import { AiIdentityState, getAiIdentityPersonMessage } from '@lightdash/common';
import { Anchor, Button, Group, Text } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { Link } from 'react-router';
import Callout from '../../../../../components/common/Callout';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useApp from '../../../../../providers/App/useApp';
import {
    useAiIdentitySignIn,
    type useAiIdentityAccess,
    isAiIdentityBlocked,
} from '../../hooks/useAiIdentityAccess';

export const AiIdentityCallout = ({
    state,
    message,
}: {
    state: AiIdentityState;
    message: string;
}) => {
    const { user } = useApp();
    const login = useAiIdentitySignIn();
    const canManage = user.data?.ability.can(
        'manage',
        subject('Organization', {
            organizationUuid: user.data.organizationUuid,
        }),
    );
    return (
        <Callout
            variant={
                state === AiIdentityState.NEEDS_SIGN_IN ? 'warning' : 'neutral'
            }
        >
            <Group gap="xs">
                <Text size="sm">{message}</Text>
                {state === AiIdentityState.NEEDS_SIGN_IN && (
                    <Button
                        size="xs"
                        onClick={() => login.mutate()}
                        loading={login.isLoading}
                    >
                        Sign in to Snowflake
                    </Button>
                )}
                {canManage && (
                    <Anchor
                        component={Link}
                        to="/generalSettings/aiIdentities"
                        size="sm"
                    >
                        Review AI identities
                    </Anchor>
                )}
            </Group>
        </Callout>
    );
};

export const AiIdentityAccessNotice = ({
    access,
    enabled,
}: {
    access: ReturnType<typeof useAiIdentityAccess>;
    enabled: boolean;
}) => {
    if (!enabled) return null;
    if (access.isLoading)
        return <EmptyStateLoader title="Checking AI access" />;
    if (access.isError)
        return (
            <InlineErrorState
                message="Could not check your AI access."
                onRetry={() => void access.refetch()}
            />
        );
    if (!isAiIdentityBlocked(access.data)) return null;
    const state = access.data.state ?? AiIdentityState.PENDING;
    return (
        <AiIdentityCallout
            state={state}
            message={access.data.message ?? getAiIdentityPersonMessage(state)}
        />
    );
};

export const AiIdentityTrustNotice = ({ name }: { name: string }) => (
    <Group gap="xs" wrap="nowrap">
        <MantineIcon icon={IconShieldCheck} size={14} color="dimmed" />
        <Text size="xs" c="dimmed">
            Runs as {name} · AI identity
        </Text>
    </Group>
);
