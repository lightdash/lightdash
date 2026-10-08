import {
    AGENT_IDENTITY_SOURCES,
    FeatureFlags,
    WarehouseTypes,
    type OrganizationAgentIdentityRule,
} from '@lightdash/common';
import {
    Accordion,
    Group,
    Select,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import CodeBlock from '../../components/common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { getWarehouseIcon } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import {
    useOrganizationAgentIdentitySettings,
    useUpdateOrganizationAgentIdentityRule,
} from './api';
import {
    agentIdentitySentence,
    identityLabels,
    identityWarehouseNames,
    requiredIdentityLabel,
} from './identityLabels';

const AgentIdentityRule = ({
    rule,
}: {
    rule: OrganizationAgentIdentityRule;
}) => {
    const { health } = useApp();
    const save = useUpdateOrganizationAgentIdentityRule();
    const configured = health.data?.auth.snowflakeAi.enabled === true;
    const siteUrl = health.data?.siteUrl ?? '';

    return (
        <Stack gap="xs">
            <Group gap="sm">
                {getWarehouseIcon(rule.warehouseType)}
                <Text size="sm">
                    {agentIdentitySentence(
                        identityWarehouseNames[
                            rule.warehouseType as keyof typeof identityWarehouseNames
                        ],
                    )}
                </Text>
                <Select
                    aria-label={`${identityWarehouseNames[rule.warehouseType as keyof typeof identityWarehouseNames]} agent identity`}
                    value={rule.source}
                    data={AGENT_IDENTITY_SOURCES[rule.warehouseType].person.map(
                        (source) => ({
                            value: source,
                            label: identityLabels[source].label,
                            disabled: source === 'agent_sign_in' && !configured,
                        }),
                    )}
                    allowDeselect={false}
                    disabled={save.isLoading}
                    w={340}
                    onChange={(value) => {
                        const source = AGENT_IDENTITY_SOURCES[
                            rule.warehouseType
                        ].person.find((allowed) => allowed === value);
                        if (source)
                            save.mutate({
                                ...rule,
                                source,
                                required:
                                    source === 'marked_person'
                                        ? false
                                        : rule.required,
                            });
                    }}
                />
            </Group>
            <Text size="sm" c="dimmed">
                {identityLabels[rule.source].helper}
            </Text>
            <Switch
                label={requiredIdentityLabel}
                checked={rule.required}
                disabled={save.isLoading || rule.source === 'marked_person'}
                thumbIcon={save.isLoading ? <Loader size="xs" /> : undefined}
                aria-busy={save.isLoading}
                onChange={(event) =>
                    save.mutate({
                        ...rule,
                        required: event.currentTarget.checked,
                    })
                }
            />
            {rule.warehouseType === WarehouseTypes.SNOWFLAKE && !configured && (
                <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                        Agent sign-in needs the Snowflake agent integration.
                    </Text>
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
                                        SNOWFLAKE_AI_OAUTH_CLIENT_SECRET from
                                        the secret output, and set
                                        SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT
                                        and SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT
                                        for the account.
                                    </Text>
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Stack>
            )}
        </Stack>
    );
};

const AgentIdentitySettings = () => {
    const { health } = useApp();
    const settings = useOrganizationAgentIdentitySettings();
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
        <Stack gap="lg">
            {settings.data?.rules
                .filter((rule) => rule.warehouseType in identityWarehouseNames)
                .map((rule) => (
                    <AgentIdentityRule key={rule.warehouseType} rule={rule} />
                ))}
        </Stack>
    );
};

const OrganizationAgentIdentitySection = () => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    if (!flag?.enabled || !user.data?.ability.can('manage', 'Organization'))
        return null;
    return (
        <SettingsCard>
            <Stack gap="md">
                <Stack gap="xs">
                    <Title order={5}>Agent identity</Title>
                    <Text size="sm" c="dimmed">
                        Choose who AI agents run as for each warehouse in your
                        organisation.
                    </Text>
                </Stack>
                <AgentIdentitySettings />
            </Stack>
        </SettingsCard>
    );
};

export default OrganizationAgentIdentitySection;
