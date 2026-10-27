import { Button, Group, Stack, Text, Title } from '@mantine/core';
import {
    useAnalyticsHistoryBackfill,
    useBackfillAnalyticsHistory,
} from '../../hooks/organization/useAnalyticsProject';
import Callout from '../common/Callout';
import { SettingsCard } from '../common/Settings/SettingsCard';

const AnalyticsHistoryBackfill = () => {
    const status = useAnalyticsHistoryBackfill();
    const backfill = useBackfillAnalyticsHistory();
    if (status.isLoading)
        return (
            <Text fz="sm" c="dimmed">
                Checking backfill status…
            </Text>
        );
    if (status.isSuccess && !status.data.running && status.data.completed)
        return null;
    return (
        <SettingsCard>
            <Stack gap="md">
                <Title order={5}>Historical activity</Title>
                <Stack gap="xs">
                    <Text fz="sm" c="dimmed">
                        Includes: retained queries, AI token usage, and
                        historical views, apps, conversations, tools and export
                        records.
                    </Text>
                    <Text fz="sm" c="dimmed">
                        Not included: conversation text, historical People
                        activity summaries, or records no longer stored.
                    </Text>
                </Stack>
                <Text fz="xs" c="dimmed">
                    Queries and AI usage update existing Analytics datasets.
                    Other records appear in Historical activity. Existing
                    captured queries and AI usage are kept.
                </Text>
                {(status.isError || backfill.isError || status.data?.error) && (
                    <Callout
                        variant="danger"
                        title="Unable to backfill history"
                    >
                        {status.error?.error.message ??
                            backfill.error?.error.message ??
                            status.data?.error}
                    </Callout>
                )}
                {status.data?.running && (
                    <Text fz="sm">
                        Backfill is running in the background. You can leave
                        this page.
                    </Text>
                )}
                <Group>
                    {status.isError ? (
                        <Button
                            variant="default"
                            onClick={() => void status.refetch()}
                        >
                            Retry check
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            loading={backfill.isLoading || status.data?.running}
                            onClick={() => backfill.mutate()}
                        >
                            Backfill available history
                        </Button>
                    )}
                </Group>
            </Stack>
        </SettingsCard>
    );
};

export default AnalyticsHistoryBackfill;
