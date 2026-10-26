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
    if (status.isLoading)
        return (
            <Text fz="sm" c="dimmed">
                Checking available query history…
            </Text>
        );
    // Derive completion from data, including after a reload or a failed job.
    if (
        status.isSuccess &&
        !status.data.running &&
        status.data.missingQueries === 0
    )
        return null;
    return (
        <SettingsCard>
            <Stack gap="md">
                <Title order={5}>Historical query activity</Title>
                <Text fz="sm" c="dimmed">
                    Import retained query history for completed UTC days.
                    Historical dates use query submission time; content names
                    reflect the current snapshot. Existing captured queries are
                    kept. This fills Query Events; historical People activity
                    summaries are not rebuilt.
                </Text>
                {status.data?.missingQueries ? (
                    <Text fz="sm">
                        {`${status.data.missingQueries.toLocaleString()} missing ${status.data.missingQueries === 1 ? 'query' : 'queries'} · ${status.data.from} to ${status.data.to}`}
                    </Text>
                ) : null}
                {status.data?.existingQueries ? (
                    <Text fz="xs" c="dimmed">
                        {status.data.existingQueries.toLocaleString()}{' '}
                        {status.data.existingQueries === 1
                            ? 'query'
                            : 'queries'}{' '}
                        already available will be skipped.
                    </Text>
                ) : null}
                {status.data?.pendingQueries ? (
                    <Text fz="xs" c="dimmed">
                        {status.data.pendingQueries.toLocaleString()} captured{' '}
                        {status.data.pendingQueries === 1
                            ? 'query is'
                            : 'queries are'}{' '}
                        awaiting processing and will be skipped.
                    </Text>
                ) : null}
                {(status.isError || backfill.isError || status.data?.error) && (
                    <Callout
                        variant="danger"
                        title="Unable to backfill query history"
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
