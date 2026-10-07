import { FeatureFlags } from '@lightdash/common';
import {
    Accordion,
    Anchor,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { Link } from 'react-router';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import useToaster from '../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import {
    useOrganizationAgentIdentitySettings,
    useUpdateOrganizationAgentIdentitySettings,
} from './api';

const AgentIdentitySettings = () => {
    const { health } = useApp();
    const settings = useOrganizationAgentIdentitySettings();
    const save = useUpdateOrganizationAgentIdentitySettings();
    const { showToastSuccess } = useToaster();
    const configured = health.data?.auth.snowflakeAi.enabled === true;
    const siteUrl = health.data?.siteUrl ?? '';

    if (settings.isLoading || health.isLoading) return <EmptyStateLoader />;
    if (settings.isError || health.isError)
        return (
            <InlineErrorState
                message="Could not load agent identity settings."
                onRetry={() => {
                    void settings.refetch();
                    void health.refetch();
                }}
            />
        );

    return (
        <Stack gap="xs">
            <Switch
                label="Require agent identity"
                description="AI agents and MCP must connect through the Snowflake agent integration before they query any Snowflake connection in this organisation. Queries without a connected agent are refused."
                checked={settings.data?.requireVerifiedAgentSessions === true}
                disabled={!configured || save.isLoading}
                thumbIcon={save.isLoading ? <Loader size="xs" /> : undefined}
                aria-busy={save.isLoading}
                onChange={(event) =>
                    save.mutate(
                        {
                            requireVerifiedAgentSessions:
                                event.currentTarget.checked,
                        },
                        {
                            onSuccess: () =>
                                showToastSuccess({
                                    title: 'Agent identity requirement saved.',
                                }),
                        },
                    )
                }
            />
            <Text size="xs" c="dimmed">
                People connect their agent from the chat or from{' '}
                <Anchor
                    component={Link}
                    to="/generalSettings/myWarehouseConnections"
                    size="xs"
                >
                    My warehouse connections
                </Anchor>
                .
            </Text>
            {!configured && (
                <Accordion variant="default">
                    <Accordion.Item value="setup">
                        <Accordion.Control>
                            Set up the Snowflake agent integration
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack gap="xs">
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
                                    SNOWFLAKE_AI_OAUTH_CLIENT_SECRET from the
                                    secret output, and set
                                    SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT
                                    and SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT for
                                    the account.
                                </Text>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            )}
        </Stack>
    );
};

const OrganizationAgentIdentitySection = () => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AiPrincipals);
    if (!flag?.enabled || !user.data?.ability.can('manage', 'Organization'))
        return null;
    return (
        <SettingsCard>
            <Stack gap="md">
                <Stack gap="xs">
                    <Title order={5}>Agent identity</Title>
                    <Text size="sm" c="dimmed">
                        Snowflake connections in this organisation.
                    </Text>
                </Stack>
                <AgentIdentitySettings />
            </Stack>
        </SettingsCard>
    );
};

export default OrganizationAgentIdentitySection;
