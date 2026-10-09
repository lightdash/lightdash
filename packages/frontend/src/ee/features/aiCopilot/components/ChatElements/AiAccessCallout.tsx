import {
    AGENT_IDENTITY_SETTINGS_PATH,
    AgentIdentityConnectEntryPoint,
    AiAccessRefusalAction,
    AiAccessRefusalReason,
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
export const AiAccessCallout = ({
    refusal,
    projectUuid,
    variant = 'card',
}: {
    refusal: AiAccessRefusal;
    projectUuid: string;
    variant?: 'card' | 'inline';
}) => {
    const { user } = useApp();
    const login = useSnowflakeAiLoginPopup({
        entryPoint: AgentIdentityConnectEntryPoint.CHAT_CARD,
        projectUuid,
    });
    const client = useQueryClient();
    const t = useUiStrings();
    const canUpdate = user.data?.ability.can('manage', 'Organization');
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
                                    Manage agent connections
                                </Anchor>
                            )}
                        </Group>
                    )}
                    {requiresSignIn && login.error && (
                        <Text size="sm" c="red" role="alert">
                            {login.error.message}
                        </Text>
                    )}
                    {refusal.action === AiAccessRefusalAction.ASK_ADMIN &&
                        canUpdate && (
                            <Anchor
                                component={Link}
                                to={AGENT_IDENTITY_SETTINGS_PATH}
                                size="sm"
                            >
                                {t('aiAccess.settings')}
                            </Anchor>
                        )}
                </Stack>
            </Group>
        </Paper>
    );
};
