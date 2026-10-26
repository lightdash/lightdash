import { Button, Group, Stack, Text, Title } from '@mantine/core';
import {
    useAnalyticsHistoryBackfill,
    useBackfillAnalyticsHistory,
} from '../../hooks/organization/useAnalyticsProject';
import Callout from '../common/Callout';
import { SettingsCard } from '../common/Settings/SettingsCard';

const AnalyticsHistoryBackfill = () => {
    const status = useAnalyticsHistoryBackfill(true);
    const backfill = useBackfillAnalyticsHistory();
    const missing =
        status.data?.missingRecords ?? status.data?.missingQueries ?? 0;
    const existing =
        status.data?.existingRecords ?? status.data?.existingQueries ?? 0;
    const pending =
        status.data?.pendingRecords ?? status.data?.pendingQueries ?? 0;
    if (status.isLoading)
        return (
            <Text fz="sm" c="dimmed">
                Checking available history…
            </Text>
        );
    // Derive completion from data, including after a reload or a failed job.
    if (status.isSuccess && !status.data.running && missing === 0) return null;
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
                    Other records appear in Historical activity.
                </Text>
                {missing ? (
                    <Text fz="sm">
                        {`${missing.toLocaleString()} ${missing === 1 ? 'record' : 'records'} to import · ${status.data?.from} to ${status.data?.to}`}
                    </Text>
                ) : null}
                {existing ? (
                    <Text fz="xs" c="dimmed">
                        {existing.toLocaleString()}{' '}
                        {existing === 1 ? 'record' : 'records'} already
                        available.
                    </Text>
                ) : null}
                {pending ? (
                    <Text fz="xs" c="dimmed">
                        {pending.toLocaleString()} captured{' '}
                        {pending === 1 ? 'event is' : 'events are'} awaiting
                        processing and will be skipped.
                    </Text>
                ) : null}
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
