import {
    Anchor,
    Box,
    Divider,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { Link } from 'react-router';
import { SlackChannelSelect } from '../../../../../../components/common/SlackChannelSelect';
import {
    useLinearInstallation,
    useLinearProjects,
    useLinearTeams,
} from '../../../../../../components/common/LinearIntegration/hooks/useLinearIntegration';
import { useGetSlack } from '../../../../../../hooks/slack/useSlack';
import useHealth from '../../../../../../hooks/health/useHealth';
import useApp from '../../../../../../providers/App/useApp';
import {
    useReviewNotificationSettings,
    useUpdateReviewNotificationSettings,
} from '../../../hooks/useReviewNotificationSettings';

/**
 * Slack and Linear destinations for AI review runs. Rendered inside the
 * "Review AI agent turns" card when reviews are enabled.
 */
export const ReviewNotificationsSettings = () => {
    const { user } = useApp();
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const { data: health } = useHealth();
    const hasLinearConfig = !!health?.hasLinear;

    const { data: slackInstallation } = useGetSlack();
    const hasSlack = !!slackInstallation?.organizationUuid;

    const linearInstallationQuery = useLinearInstallation({
        enabled: hasLinearConfig,
    });
    const hasLinear = !!linearInstallationQuery.data;
    const { data: linearTeams, isInitialLoading: isLinearTeamsLoading } =
        useLinearTeams({
            enabled: hasLinear,
        });

    const { data: settings, isInitialLoading } =
        useReviewNotificationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateReviewNotificationSettings();
    const { data: linearProjects, isInitialLoading: isLinearProjectsLoading } =
        useLinearProjects({
            enabled: hasLinear && !!settings?.linearTeamId,
            teamId: settings?.linearTeamId ?? undefined,
        });

    if (!hasSlack && !hasLinearConfig) {
        return null;
    }

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
                                message and in the in-app bell, regardless of
                                this setting.
                            </Text>
                        </Box>
                        {isInitialLoading || !settings ? (
                            <Loader size="sm" />
                        ) : (
                            <Switch
                                size="md"
                                checked={settings.enabled}
                                disabled={!canEdit || isUpdating}
                                onChange={(event) =>
                                    updateSettings({
                                        enabled: event.currentTarget.checked,
                                        slackChannelId:
                                            settings.slackChannelId,
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

            {hasLinearConfig && (
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
                                Linear issues
                            </Title>
                            <Text c="dimmed" fz="xs">
                                Create a Linear issue when a review run
                                surfaces a new finding. Choose a team and
                                optionally a project.
                            </Text>
                            {!hasLinear && !linearInstallationQuery.isInitialLoading && (
                                <Text c="dimmed" fz="xs" mt="xs">
                                    Connect Linear in{' '}
                                    <Anchor
                                        component={Link}
                                        to="/generalSettings/integrations"
                                    >
                                        Integrations
                                    </Anchor>{' '}
                                    to send new issues there.
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
                                checked={settings.linearEnabled}
                                disabled={
                                    !canEdit ||
                                    isUpdating ||
                                    !hasLinear ||
                                    (!settings.linearTeamId &&
                                        !settings.linearEnabled)
                                }
                                onChange={(event) =>
                                    updateSettings({
                                        enabled: settings.enabled,
                                        slackChannelId:
                                            settings.slackChannelId,
                                        linearEnabled:
                                            event.currentTarget.checked,
                                        linearTeamId: settings.linearTeamId,
                                        linearProjectId:
                                            settings.linearProjectId,
                                    })
                                }
                            />
                        )}
                    </Group>

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
                                    !canEdit ||
                                    isUpdating ||
                                    isLinearTeamsLoading
                                }
                                onChange={(linearTeamId) =>
                                    updateSettings({
                                        enabled: settings.enabled,
                                        slackChannelId:
                                            settings.slackChannelId,
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
                                        slackChannelId:
                                            settings.slackChannelId,
                                        linearEnabled: true,
                                        linearTeamId: settings.linearTeamId,
                                        linearProjectId,
                                    })
                                }
                            />
                        </Stack>
                    )}
                </>
            )}
        </>
    );
};
