import { Divider, Loader, Switch } from '@mantine/core';
import { SlackChannelSelect } from '../../../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../../../hooks/slack/useSlack';
import useApp from '../../../../../../providers/App/useApp';
import {
    useReviewNotificationSettings,
    useUpdateReviewNotificationSettings,
} from '../../../hooks/useReviewNotificationSettings';
import { JiraReviewSettings } from './JiraReviewSettings';
import { LinearReviewSettings } from './LinearReviewSettings';
import { SettingRow } from './SettingLayout';

/** Notification and issue destinations shown only while AI agent reviews run. */
export const ReviewNotificationsSettings = () => {
    const { user } = useApp();
    const canEdit = user.data?.ability?.can('manage', 'Organization') ?? false;
    const { data: slackInstallation } = useGetSlack();
    const hasSlack = !!slackInstallation?.organizationUuid;
    const { data: settings, isInitialLoading } =
        useReviewNotificationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateReviewNotificationSettings();

    return (
        <>
            {hasSlack && (
                <>
                    <Divider />
                    <SettingRow
                        title="Slack notifications"
                        description="Post to a Slack channel when a review run surfaces findings that need review. Assignment notifications are always sent as a direct message and in the in-app bell."
                        control={
                            isInitialLoading || !settings ? (
                                <Loader size="sm" />
                            ) : (
                                <Switch
                                    size="md"
                                    aria-label="Post AI review findings to Slack"
                                    checked={settings.enabled}
                                    disabled={!canEdit || isUpdating}
                                    onChange={(event) =>
                                        updateSettings({
                                            enabled:
                                                event.currentTarget.checked,
                                            slackChannelId:
                                                settings.slackChannelId,
                                        })
                                    }
                                />
                            )
                        }
                    />

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
                                })
                            }
                        />
                    )}
                </>
            )}

            <LinearReviewSettings />
            <JiraReviewSettings />
        </>
    );
};
