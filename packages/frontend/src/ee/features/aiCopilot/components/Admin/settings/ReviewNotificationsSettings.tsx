import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconExternalLink, IconKey, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
    useDeleteLinearInstallationMutation,
    useLinearInstallation,
    useLinearProjects,
    useLinearTeams,
} from '../../../../../../components/common/LinearIntegration/hooks/useLinearIntegration';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { SlackChannelSelect } from '../../../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../../../hooks/slack/useSlack';
import useApp from '../../../../../../providers/App/useApp';
import {
    useReviewNotificationSettings,
    useUpdateReviewNotificationSettings,
} from '../../../hooks/useReviewNotificationSettings';

/** Notification and issue destinations shown only while AI agent reviews run. */
export const ReviewNotificationsSettings = () => {
    const { health, user } = useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const [linearClientId, setLinearClientId] = useState('');

    const { data: slackInstallation } = useGetSlack();
    const hasSlack = !!slackInstallation?.organizationUuid;

    const linearInstallationQuery = useLinearInstallation();
    const hasLinear = !!linearInstallationQuery.data;
    const { data: linearTeams, isInitialLoading: isLinearTeamsLoading } =
        useLinearTeams({ enabled: hasLinear });
    const deleteLinear = useDeleteLinearInstallationMutation();

    const { data: settings, isInitialLoading } =
        useReviewNotificationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateReviewNotificationSettings();
    const { data: linearProjects, isInitialLoading: isLinearProjectsLoading } =
        useLinearProjects({
            enabled: hasLinear,
            teamId: settings?.linearTeamId ?? null,
        });

    const isLinearUpdating = deleteLinear.isLoading;
    const resetLinearDestination = useCallback(() => {
        if (!settings) return;
        updateSettings({
            enabled: settings.enabled,
            slackChannelId: settings.slackChannelId,
            linearEnabled: false,
            linearTeamId: null,
            linearProjectId: null,
        });
    }, [settings, updateSettings]);

    useEffect(() => {
        if (
            searchParams.get('linearWorkspaceChanged') !== 'true' ||
            !settings
        ) {
            return;
        }

        resetLinearDestination();
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete('linearWorkspaceChanged');
                return next;
            },
            { replace: true },
        );
    }, [resetLinearDestination, searchParams, setSearchParams, settings]);
    const submitLinearOAuth = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const clientId = linearClientId.trim();
        if (!clientId) return;

        window.location.assign(
            `/api/v1/linear/install?clientId=${encodeURIComponent(clientId)}`,
        );
    };

    const siteUrl = health.data?.siteUrl ?? window.location.origin;
    const callbackUrl = new URL('/api/v1/linear/oauth/callback', siteUrl).href;
    const linearAppSetupParams = new URLSearchParams({
        distribution: 'private',
        'display.description':
            'Creates issues from Lightdash AI agent review findings.',
        'developer.name': 'Lightdash',
        'oauth.client_name': 'Lightdash AI reviews',
        'oauth.client_uri': siteUrl,
        'oauth.redirect_uris': callbackUrl,
        'oauth.grant_types': 'authorization_code',
    });
    const linearAppSetupUrl = `https://linear.app/settings/api/applications/new?${linearAppSetupParams.toString()}`;

    return (
        <>
            {hasSlack && (
                <>
                    <Divider mx="calc(var(--mantine-spacing-md) * -1)" />
                    <Group
                        justify="space-between"
                        wrap="nowrap"
                        align="flex-start"
                        gap="md"
                    >
                        <Box maw={620}>
                            <Title order={6} mb={4}>
                                Slack notifications
                            </Title>
                            <Text c="dimmed" fz="xs">
                                Post to a Slack channel when a review run
                                surfaces findings that need review. Assignment
                                notifications are always sent as a direct
                                message and in the in-app bell.
                            </Text>
                        </Box>
                        {isInitialLoading || !settings ? (
                            <Loader size="sm" />
                        ) : (
                            <Switch
                                size="md"
                                aria-label="Post AI review findings to Slack"
                                checked={settings.enabled}
                                disabled={!canEdit || isUpdating}
                                onChange={(event) =>
                                    updateSettings({
                                        enabled: event.currentTarget.checked,
                                        slackChannelId: settings.slackChannelId,
                                        linearEnabled: settings.linearEnabled,
                                        linearTeamId: settings.linearTeamId,
                                        linearProjectId:
                                            settings.linearProjectId,
                                    })
                                }
                            />
                        )}
                    </Group>

                    {settings?.enabled && (
                        <SlackChannelSelect
                            label="Slack channel"
                            value={settings.slackChannelId}
                            disabled={!canEdit || isUpdating}
                            withRefresh
                            placeholder="Select a channel"
                            onChange={(slackChannelId) =>
                                updateSettings({
                                    enabled: true,
                                    slackChannelId,
                                    linearEnabled: settings.linearEnabled,
                                    linearTeamId: settings.linearTeamId,
                                    linearProjectId: settings.linearProjectId,
                                })
                            }
                        />
                    )}
                </>
            )}

            <Divider mx="calc(var(--mantine-spacing-md) * -1)" />
            <Group
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
                gap="md"
            >
                <Box maw={620}>
                    <Group gap="xs" mb={4}>
                        <Title order={6}>Linear issues</Title>
                        {hasLinear && (
                            <Badge
                                size="sm"
                                variant="light"
                                color="green"
                                leftSection={
                                    <MantineIcon icon={IconKey} size={12} />
                                }
                            >
                                Connected
                            </Badge>
                        )}
                    </Group>
                    <Text c="dimmed" fz="xs">
                        Create a Linear issue for each new review finding. The
                        connection is authorized in Linear and its tokens are
                        stored encrypted for this Lightdash organization. Issues
                        are created by the Lightdash app.
                    </Text>
                    {hasLinear && (
                        <Text c="dimmed" fz="xs" mt={4}>
                            Connected to{' '}
                            {linearInstallationQuery.data.organizationName} (
                            {linearInstallationQuery.data.organizationUrlKey}).
                        </Text>
                    )}
                </Box>
                {isInitialLoading ||
                !settings ||
                linearInstallationQuery.isInitialLoading ? (
                    <Loader size="sm" />
                ) : (
                    <Switch
                        size="md"
                        aria-label="Create Linear issues for AI review findings"
                        checked={settings.linearEnabled && hasLinear}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !hasLinear ||
                            (!settings.linearTeamId && !settings.linearEnabled)
                        }
                        onChange={(event) =>
                            updateSettings({
                                enabled: settings.enabled,
                                slackChannelId: settings.slackChannelId,
                                linearEnabled: event.currentTarget.checked,
                                linearTeamId: settings.linearTeamId,
                                linearProjectId: settings.linearProjectId,
                            })
                        }
                    />
                )}
            </Group>

            {hasLinear ? (
                <Group gap="xs" justify="flex-end">
                    <Button
                        size="xs"
                        variant="default"
                        component="a"
                        href="/api/v1/linear/install"
                        disabled={!canEdit || isLinearUpdating}
                    >
                        Reconnect
                    </Button>
                    <Button
                        type="button"
                        size="xs"
                        variant="subtle"
                        color="red"
                        disabled={!canEdit || isLinearUpdating}
                        leftSection={<MantineIcon icon={IconTrash} size={14} />}
                        onClick={() =>
                            deleteLinear.mutate(undefined, {
                                onSuccess: resetLinearDestination,
                            })
                        }
                    >
                        Remove
                    </Button>
                </Group>
            ) : (
                <Stack gap="xs">
                    <Text c="dimmed" fz="xs">
                        Create a private OAuth app with the callback already
                        filled in, then paste its public client ID once. No API
                        key or client secret required.
                    </Text>
                    <Group gap="xs" justify="flex-start">
                        <Button
                            size="xs"
                            variant="subtle"
                            component="a"
                            href={linearAppSetupUrl}
                            target="_blank"
                            rel="noreferrer"
                            rightSection={
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size={14}
                                />
                            }
                        >
                            Create Linear app
                        </Button>
                    </Group>
                    <form onSubmit={submitLinearOAuth}>
                        <Group gap="xs" wrap="nowrap" align="flex-end">
                            <TextInput
                                style={{ flex: 1 }}
                                size="xs"
                                label="Linear OAuth client ID"
                                value={linearClientId}
                                placeholder="Paste the client ID from Linear"
                                disabled={!canEdit || isLinearUpdating}
                                onChange={(event) =>
                                    setLinearClientId(event.currentTarget.value)
                                }
                            />
                            <Button
                                type="submit"
                                size="xs"
                                disabled={
                                    !canEdit ||
                                    isLinearUpdating ||
                                    linearClientId.trim().length === 0
                                }
                            >
                                Connect Linear
                            </Button>
                        </Group>
                    </form>
                </Stack>
            )}

            {hasLinear && settings && (
                <Stack gap="sm">
                    <Select
                        label="Linear team"
                        placeholder={
                            isLinearTeamsLoading
                                ? 'Loading teams'
                                : 'Select a team'
                        }
                        data={(linearTeams ?? []).map((team) => ({
                            value: team.id,
                            label: `${team.name} (${team.key})`,
                        }))}
                        value={settings.linearTeamId}
                        disabled={
                            !canEdit || isUpdating || isLinearTeamsLoading
                        }
                        onChange={(linearTeamId) =>
                            updateSettings({
                                enabled: settings.enabled,
                                slackChannelId: settings.slackChannelId,
                                linearEnabled: true,
                                linearTeamId,
                                linearProjectId: null,
                            })
                        }
                    />
                    <Select
                        label="Linear project"
                        placeholder={
                            isLinearProjectsLoading
                                ? 'Loading projects'
                                : 'Optional project'
                        }
                        data={(linearProjects ?? []).map((project) => ({
                            value: project.id,
                            label: project.name,
                        }))}
                        value={settings.linearProjectId}
                        disabled={
                            !canEdit ||
                            isUpdating ||
                            !settings.linearTeamId ||
                            isLinearProjectsLoading
                        }
                        clearable
                        onChange={(linearProjectId) =>
                            updateSettings({
                                enabled: settings.enabled,
                                slackChannelId: settings.slackChannelId,
                                linearEnabled: true,
                                linearTeamId: settings.linearTeamId,
                                linearProjectId,
                            })
                        }
                    />
                </Stack>
            )}
        </>
    );
};
