import { Button, Stack, Text } from '@mantine/core';
import {
    useAnalyticsHistoryBackfill,
    useBackfillAnalyticsHistory,
} from '../../hooks/organization/useAnalyticsProject';
import Callout from '../common/Callout';
import { SettingRow, SettingsSection } from '../common/Settings/SettingLayout';
import { SettingsCard } from '../common/Settings/SettingsCard';

const AnalyticsHistoryBackfill = () => {
    const status = useAnalyticsHistoryBackfill();
    const backfill = useBackfillAnalyticsHistory();
    if (status.isLoading)
        return (
            <Text fz="xs" c="dimmed">
                Checking backfill status…
            </Text>
        );
    if (status.isSuccess && !status.data.running && status.data.completed)
        return null;
    return (
        <SettingsSection
            label="Historical records"
            description="Retained database records supplement collected events and may contain less detail. This import runs separately from event processing."
        >
            <SettingsCard>
                <SettingRow
                    title="Additional historical records"
                    description="Includes retained queries, AI token usage, and activity records for views, apps, AI conversations, tools and exports. Not included: AI prompts and replies, historical People activity summaries, or records no longer stored."
                    control={
                        status.isError ? (
                            <Button
                                variant="default"
                                onClick={() => void status.refetch()}
                            >
                                Retry check
                            </Button>
                        ) : (
                            <Button
                                variant="default"
                                loading={
                                    backfill.isLoading || status.data?.running
                                }
                                onClick={() => backfill.mutate()}
                            >
                                Backfill available history
                            </Button>
                        )
                    }
                >
                    <Stack gap="sm" mt="xs">
                        <Text fz="xs" c="dimmed">
                            Queries and AI usage appear in their existing
                            datasets. Other records appear in Historical
                            activity. Existing captured data is kept.
                        </Text>
                        {status.data?.running && (
                            <Text fz="xs">
                                Backfill is running in the background. This can
                                take a few minutes, or longer for larger
                                histories. You can leave this page.
                            </Text>
                        )}
                        {(status.isError ||
                            backfill.isError ||
                            status.data?.error) && (
                            <Callout
                                variant="danger"
                                title="Unable to backfill history"
                            >
                                {status.error?.error.message ??
                                    backfill.error?.error.message ??
                                    status.data?.error}
                            </Callout>
                        )}
                    </Stack>
                </SettingRow>
            </SettingsCard>
        </SettingsSection>
    );
};

export default AnalyticsHistoryBackfill;
