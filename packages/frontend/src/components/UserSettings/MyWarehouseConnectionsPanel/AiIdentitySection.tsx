import {
    AiIdentityState,
    getAiIdentityPersonLabel,
    type AiAccessForUser,
    type ApiError,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { lightdashApi } from '../../../api';
import {
    aiIdentityPersonQueryKey,
    useAiIdentitySignIn,
} from '../../../ee/features/aiCopilot/hooks/useAiIdentityAccess';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import InlineErrorState from '../../common/InlineErrorState';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';

type PersonAiIdentity = Pick<
    AiAccessForUser,
    'aiIdentityName' | 'lastCheckedAt' | 'action' | 'message'
> & {
    aiIdentityAccountUuid: string;
    accountLabel: string;
    state: AiIdentityState;
};

export const AiIdentityCard = ({
    identity,
}: {
    identity: PersonAiIdentity;
}) => {
    const login = useAiIdentitySignIn();
    return (
        <SettingsCard p="xl">
            <Stack gap="sm">
                <Group justify="space-between">
                    <Group gap="xs">
                        <MantineIcon icon={IconShieldCheck} color="indigo" />
                        <Title order={5}>AI identity</Title>
                    </Group>
                    <Badge
                        color={
                            identity.state === AiIdentityState.READY
                                ? 'green'
                                : identity.state ===
                                    AiIdentityState.NEEDS_SIGN_IN
                                  ? 'yellow'
                                  : 'gray'
                        }
                    >
                        {getAiIdentityPersonLabel(identity.state)}
                    </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                    {identity.accountLabel}
                </Text>
                <Text size="sm">
                    {identity.state === AiIdentityState.READY ? (
                        <>
                            AI uses{' '}
                            <Text span fw={500}>
                                {identity.aiIdentityName}
                            </Text>{' '}
                            in Snowflake, set up by your admin for AI use.
                        </>
                    ) : (
                        identity.message
                    )}
                </Text>
                <Tooltip
                    label={
                        identity.lastCheckedAt
                            ? dayjs(identity.lastCheckedAt).format(
                                  'D MMM YYYY, HH:mm:ss',
                              )
                            : 'This identity has not been checked yet'
                    }
                >
                    <Text size="xs" c="dimmed">
                        {identity.lastCheckedAt
                            ? `Last checked ${dayjs(identity.lastCheckedAt).fromNow()}`
                            : 'Not checked yet'}
                    </Text>
                </Tooltip>
                {identity.state === AiIdentityState.NEEDS_SIGN_IN && (
                    <Group>
                        <Button
                            size="xs"
                            loading={login.isLoading}
                            onClick={() => login.mutate()}
                        >
                            Sign in to Snowflake
                        </Button>
                    </Group>
                )}
            </Stack>
        </SettingsCard>
    );
};

export const AiIdentitySection = () => {
    const identities = useQuery<PersonAiIdentity[], ApiError>({
        queryKey: [...aiIdentityPersonQueryKey, 'identities'],
        queryFn: () =>
            lightdashApi<PersonAiIdentity[]>({
                version: 'v2',
                url: '/user/me/ai-identities',
                method: 'GET',
                body: undefined,
            }),
        refetchInterval: 30_000,
    });
    if (identities.isLoading)
        return <EmptyStateLoader title="Loading AI identities" />;
    if (identities.isError)
        return (
            <InlineErrorState
                message="Could not load your AI identities."
                onRetry={() => void identities.refetch()}
            />
        );
    if (!identities.data.length)
        return (
            <Paper variant="dotted" p="md">
                <Text size="sm" c="dimmed">
                    No AI identities are available for your Snowflake accounts
                    yet.
                </Text>
            </Paper>
        );
    return (
        <Stack gap="lg">
            {identities.data.map((identity) => (
                <AiIdentityCard
                    key={identity.aiIdentityAccountUuid}
                    identity={identity}
                />
            ))}
        </Stack>
    );
};
