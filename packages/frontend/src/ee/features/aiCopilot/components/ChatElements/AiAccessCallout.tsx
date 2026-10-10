import { subject } from '@casl/ability';
import {
    AGENT_IDENTITY_SETTINGS_PATH,
    AgentIdentityConnectEntryPoint,
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    getProjectAgentIdentitySettingsPath,
    interpolateUiString,
    type AiAccessRefusal,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useSnowflakeAiLoginPopup } from '../../../../../hooks/useSnowflake';
import useApp from '../../../../../providers/App/useApp';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { getAiAccessRefusalRequirements } from './aiAccessRefusal';

const getRefusalSettings = (
    refusal: AiAccessRefusal,
    projectUuid: string,
): {
    isProjectSettings: boolean;
    targetProjectUuid: string;
    settingsUrl: string;
} => {
    const targetProjectUuid = refusal.projectUuid ?? projectUuid;
    const settingsUrl = refusal.settingsUrl ?? AGENT_IDENTITY_SETTINGS_PATH;
    let settingsPath: string | null = null;
    try {
        const url = new URL(settingsUrl, window.location.origin);
        if (url.origin === window.location.origin) {
            settingsPath = url.pathname;
        }
    } catch {
        settingsPath = null;
    }
    return {
        isProjectSettings:
            refusal.reason ===
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING ||
            refusal.reason ===
                AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID ||
            (refusal.reason ===
                AiAccessRefusalReason.AGENT_RAW_SQL_UNCONFIRMED &&
                settingsPath ===
                    getProjectAgentIdentitySettingsPath(targetProjectUuid)),
        targetProjectUuid,
        settingsUrl: settingsPath ?? settingsUrl,
    };
};

const AiAccessSettingsLink = ({
    refusal,
    projectUuid,
}: {
    refusal: AiAccessRefusal;
    projectUuid: string;
}) => {
    const { user } = useApp();
    const t = useUiStrings();
    const { isProjectSettings, targetProjectUuid, settingsUrl } =
        getRefusalSettings(refusal, projectUuid);
    const canUpdate = isProjectSettings
        ? user.data?.ability.can(
              'manage',
              subject('Project', {
                  organizationUuid: user.data.organizationUuid,
                  projectUuid: targetProjectUuid,
              }),
          )
        : user.data?.ability.can('manage', 'Organization');
    if (!canUpdate) return null;
    return (
        <Anchor component={Link} to={settingsUrl} size="sm">
            {t(
                isProjectSettings
                    ? 'aiAccess.projectSettings'
                    : 'aiAccess.settings',
            )}
        </Anchor>
    );
};

export const AiAccessCallout = ({
    refusal,
    projectUuid,
    variant = 'card',
}: {
    refusal: AiAccessRefusal;
    projectUuid: string;
    variant?: 'card' | 'inline';
}) => {
    const t = useUiStrings();
    const requirements = getAiAccessRefusalRequirements(refusal);
    const login = useSnowflakeAiLoginPopup({
        entryPoint: AgentIdentityConnectEntryPoint.CHAT_CARD,
        projectUuid,
    });
    const client = useQueryClient();
    const requiresSignIn = refusal.action === AiAccessRefusalAction.SIGN_IN;
    return (
        <Paper p="md" mb="md">
            <Group gap="sm" align="flex-start" wrap="nowrap">
                <MantineIcon icon={IconShieldCheck} color="dimmed" />
                <Stack gap="sm" flex={1}>
                    {requiresSignIn && variant === 'card' && (
                        <Title order={5}>
                            Connect your agent to your warehouse
                        </Title>
                    )}
                    <Text size="sm" c="dimmed">
                        {requiresSignIn &&
                        refusal.reason !== AiAccessRefusalReason.SIGN_IN_EXPIRED
                            ? variant === 'inline'
                                ? 'Connect your agent to your warehouse to run this.'
                                : 'Connect once so the agent can query Snowflake as you, in a session your warehouse can verify.'
                            : refusal.message}
                    </Text>
                    {requirements && (
                        <Text size="sm" c="dimmed">
                            {interpolateUiString(t('aiAccess.alsoNeeded'), {
                                requirements,
                            })}
                        </Text>
                    )}
                    {refusal.explanationUrl && (
                        <Anchor
                            component={Link}
                            to={refusal.explanationUrl}
                            size="sm"
                        >
                            {t('aiAccess.seeWhy')}
                        </Anchor>
                    )}
                    {refusal.action === AiAccessRefusalAction.SIGN_IN && (
                        <Group>
                            <Button
                                size="xs"
                                loading={login.isLoading}
                                onClick={() =>
                                    login.mutate(undefined, {
                                        onSuccess: () => {
                                            void client.invalidateQueries([
                                                'ai-access',
                                                projectUuid,
                                            ]);
                                        },
                                    })
                                }
                            >
                                Connect agent
                            </Button>
                            {variant === 'card' && (
                                <Anchor
                                    component={Link}
                                    to="/generalSettings/myAgentConnections"
                                    size="sm"
                                >
                                    My agent identity
                                </Anchor>
                            )}
                        </Group>
                    )}
                    {requiresSignIn && login.error && (
                        <Text size="sm" c="red" role="alert">
                            {login.error.message}
                        </Text>
                    )}
                    {refusal.action === AiAccessRefusalAction.ASK_ADMIN && (
                        <AiAccessSettingsLink
                            refusal={refusal}
                            projectUuid={projectUuid}
                        />
                    )}
                </Stack>
            </Group>
        </Paper>
    );
};
