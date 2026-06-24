import {
    Box,
    Divider,
    Group,
    Loader,
    Switch,
    Text,
    Title,
} from '@mantine-8/core';
import { SlackChannelSelect } from '../../../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../../../hooks/slack/useSlack';
import useApp from '../../../../../../providers/App/useApp';
import {
    useReviewNotificationSettings,
    useUpdateReviewNotificationSettings,
} from '../../../hooks/useReviewNotificationSettings';

/**
 * Slack channel notifications for AI review runs. Rendered inside the
 * "Review AI agent turns" card, only when reviews are enabled and the org has
 * a Slack integration. The in-app bell + assignment DMs fire independently.
 */
export const ReviewNotificationsSettings = () => {
    const { user } = useApp();
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;

    const { data: slackInstallation } = useGetSlack();
    const hasSlack = !!slackInstallation?.organizationUuid;

    const { data: settings, isInitialLoading } =
        useReviewNotificationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateReviewNotificationSettings();

    if (!hasSlack) {
        return null;
    }

    return (
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
                        Post to a Slack channel when a review run surfaces
                        findings that need review. Assignment notifications are
                        always sent as a direct message and in the in-app bell,
                        regardless of this setting.
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
                                slackChannelId: settings.slackChannelId,
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
                        updateSettings({ enabled: true, slackChannelId })
                    }
                />
            )}
        </>
    );
};
