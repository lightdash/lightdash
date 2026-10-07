import { subject } from '@casl/ability';
import {
    AI_DIRECT_TRANSPORT,
    AiPrincipalKind,
    FeatureFlags,
} from '@lightdash/common';
import { Accordion, Loader, Stack, Switch, Text } from '@mantine/core';
import {
    useAiAccessPolicy,
    useUpsertAiAccessPolicy,
} from '../../../features/aiAccess/api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import CodeBlock from '../../common/CodeBlock/CodeBlock';
import EmptyStateLoader from '../../common/EmptyStateLoader';
import InlineErrorState from '../../common/InlineErrorState';

const AgentIdentityPolicy = ({
    projectUuid,
    connection,
    disabled,
}: {
    projectUuid: string;
    connection: string | null;
    disabled: boolean;
}) => {
    const { health } = useApp();
    const policy = useAiAccessPolicy(projectUuid, connection);
    const save = useUpsertAiAccessPolicy(projectUuid, connection);
    const { showToastSuccess } = useToaster();
    const configured = health.data?.auth.snowflakeAi.enabled === true;
    const siteUrl = health.data?.siteUrl ?? '';

    if (policy.isLoading || health.isLoading) return <EmptyStateLoader />;
    if (policy.isError || health.isError)
        return (
            <InlineErrorState
                message="Could not load agent identity settings."
                onRetry={() => {
                    void policy.refetch();
                    void health.refetch();
                }}
            />
        );

    return (
        <Stack gap="xs">
            <Switch
                label="Require agent identity"
                description="AI agents and MCP must connect through the Snowflake agent integration. Queries without a connected agent are refused."
                checked={
                    policy.data?.enabled === true &&
                    policy.data.principalKind === AiPrincipalKind.PERSON
                }
                disabled={disabled || !configured || save.isLoading}
                thumbIcon={save.isLoading ? <Loader size="xs" /> : undefined}
                aria-busy={save.isLoading}
                onChange={(event) =>
                    save.mutate(
                        {
                            enabled: event.currentTarget.checked,
                            principalKind: AiPrincipalKind.PERSON,
                            transport: AI_DIRECT_TRANSPORT,
                            sharedRef: null,
                            twinNameTemplate: null,
                            groupMappings: [],
                            policySource: null,
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

const SnowflakeAgentIdentitySection = (props: {
    projectUuid: string;
    connection: string | null;
    disabled: boolean;
}) => {
    const { user } = useApp();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AiPrincipals);
    const { data: project } = useProject(props.projectUuid);
    if (
        !flag?.enabled ||
        !project ||
        !user.data?.ability.can('manage', subject('Project', project))
    )
        return null;
    return <AgentIdentityPolicy {...props} />;
};

export default SnowflakeAgentIdentitySection;
