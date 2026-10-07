import { subject } from '@casl/ability';
import { AiAccessRefusalAction, type AiAccessRefusal } from '@lightdash/common';
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
import { useProject } from '../../../../../hooks/useProject';
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
    const { data: project } = useProject(projectUuid);
    const login = useSnowflakeAiLoginPopup();
    const client = useQueryClient();
    const t = useUiStrings();
    const canUpdate =
        project &&
        user.data?.ability.can('manage', subject('Project', project));
    const requiresSignIn = refusal.action === AiAccessRefusalAction.SIGN_IN;
    return (
        <Paper p="md" mb="md">
            <Group gap="sm" align="flex-start" wrap="nowrap">
                <MantineIcon icon={IconShieldCheck} color="dimmed" />
                <Stack gap="sm" flex={1}>
                    {requiresSignIn && variant === 'card' && (
                        <Title order={5}>
                            Sign in to your warehouse for agent sessions
                        </Title>
                    )}
                    <Text size="sm" c="dimmed">
                        {requiresSignIn
                            ? 'Your warehouse checks that agent queries come from your own verified session.'
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
                                Sign in for agent sessions
                            </Button>
                        </Group>
                    )}
                    {requiresSignIn && login.error && (
                        <Text size="sm" c="red" role="alert">
                            {login.error.message}
                        </Text>
                    )}
                    {requiresSignIn && variant === 'card' && (
                        <Text size="xs" c="dimmed">
                            Manage your sessions in{' '}
                            <Anchor
                                component={Link}
                                to="/generalSettings/myWarehouseConnections"
                                size="xs"
                            >
                                My warehouse connections
                            </Anchor>
                            .
                        </Text>
                    )}
                    {refusal.action === AiAccessRefusalAction.ASK_ADMIN &&
                        canUpdate && (
                            <Anchor
                                component={Link}
                                to={`/generalSettings/projectManagement/${projectUuid}/aiAccess`}
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
