import {
    AI_DIRECT_TRANSPORT,
    AiPrincipalKind,
    type AiAccessPolicy,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Group,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import useToaster from '../../hooks/toaster/useToaster';
import useApp from '../../providers/App/useApp';
import { useUpsertAiAccessPolicy } from './api';

const InstanceSetup = ({
    configured,
    siteUrl,
}: {
    configured: boolean;
    siteUrl: string;
}) => (
    <Stack gap="xs">
        <Text fw={500}>Instance setup</Text>
        {configured ? (
            <Group gap="xs">
                <Text size="sm">Agent sign-in integration configured.</Text>
                <Badge color="green">Configured</Badge>
            </Group>
        ) : (
            <>
                <Text size="sm" c="orange">
                    The agent sign-in integration is not configured on this
                    instance.
                </Text>
                <CodeBlock
                    language="sql"
                    copyLabel="Copy integration SQL"
                    code={`CREATE SECURITY INTEGRATION LIGHTDASH_AGENT
  TYPE = OAUTH
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = '${siteUrl.replace(/\/$/, '').replaceAll("'", "''")}/api/v1/oauth/redirect/snowflake-ai'
  ENABLED = TRUE
  IS_AGENTIC = TRUE
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('LIGHTDASH_AGENT');`}
                />
                <Text size="xs" c="dimmed">
                    Set SNOWFLAKE_AI_OAUTH_CLIENT_ID and
                    SNOWFLAKE_AI_OAUTH_CLIENT_SECRET from the secret output, and
                    set SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT and
                    SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT for the account.
                </Text>
            </>
        )}
    </Stack>
);

const VerifiedSessions = ({
    projectUuid,
    connection,
    policy,
    configured,
}: {
    projectUuid: string;
    connection: string | null;
    policy: AiAccessPolicy | null;
    configured: boolean;
}) => {
    const save = useUpsertAiAccessPolicy(projectUuid, connection);
    const { showToastSuccess } = useToaster();
    return (
        <Stack gap="xs">
            <Switch
                label="Require verified agent sessions"
                description="Agents must sign in through the agent integration. Queries without it are refused."
                checked={
                    policy?.enabled === true &&
                    policy.principalKind === AiPrincipalKind.PERSON
                }
                disabled={!configured || save.isLoading}
                onChange={(event) =>
                    save.mutate(
                        {
                            enabled: event.currentTarget.checked,
                            principalKind: AiPrincipalKind.PERSON,
                            transport: AI_DIRECT_TRANSPORT,
                            sharedRef: null,
                            twinNameTemplate: null,
                            groupMappings: [],
                            policySource: policy?.policySource ?? null,
                        },
                        {
                            onSuccess: () =>
                                showToastSuccess({
                                    title: 'Agent session requirement saved.',
                                }),
                        },
                    )
                }
            />
            <Text size="sm" c="dimmed">
                People sign in from the chat or from{' '}
                <Anchor
                    component={Link}
                    to="/generalSettings/myWarehouseConnections"
                    inherit
                >
                    My warehouse connections
                </Anchor>
                .
            </Text>
            {!configured && (
                <Text size="sm" c="dimmed">
                    Configure the agent sign-in integration to change this
                    requirement.
                </Text>
            )}
        </Stack>
    );
};

export const SnowflakeIdentityCard = ({
    projectUuid,
    connection,
    policy,
    connectionSelector,
}: {
    projectUuid: string;
    connection: string | null;
    policy: AiAccessPolicy | null;
    connectionSelector: ReactNode;
}) => {
    const { health } = useApp();
    const configured = health.data?.auth.snowflakeAi.enabled === true;
    return (
        <SettingsCard>
            <Stack>
                <Stack gap={4}>
                    <Title order={5}>Identity</Title>
                    <Text c="dimmed" fz="xs">
                        What agents run as on this warehouse.
                    </Text>
                </Stack>
                {connectionSelector}
                <Stack gap="xs">
                    <Text fw={500}>Agents run as the marked person.</Text>
                    <Text size="sm">
                        Snowflake verifies the session once the person has
                        signed in for agent sessions.
                    </Text>
                </Stack>
                {health.isLoading ? (
                    <EmptyStateLoader />
                ) : health.isError ? (
                    <InlineErrorState
                        message="Could not load the instance setup."
                        onRetry={() => void health.refetch()}
                    />
                ) : (
                    <>
                        <InstanceSetup
                            configured={configured}
                            siteUrl={health.data?.siteUrl ?? ''}
                        />
                        <VerifiedSessions
                            projectUuid={projectUuid}
                            connection={connection}
                            policy={policy}
                            configured={configured}
                        />
                    </>
                )}
            </Stack>
        </SettingsCard>
    );
};
