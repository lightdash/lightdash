import { Group, Loader, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useDelayedLoading } from '../hooks/useDelayedLoading';
import styles from './EventAnalyticsContent.module.css';
import { GeneratedSql } from './GeneratedSql';

type Props = {
    filters: ReactNode;
    isLoading: boolean;
    hasResults: boolean;
    sql: string | null;
    durationMs: number | null;
    emptyMessage: ReactNode;
    chart: ReactNode;
    table: ReactNode;
};

/** Main content layout shared by the event analytics builders. */
export const EventAnalyticsContent: FC<Props> = ({
    filters,
    isLoading,
    hasResults,
    sql,
    durationMs,
    emptyMessage,
    chart,
    table,
}) => {
    const showLoading = useDelayedLoading(isLoading);

    return (
        <div className={styles.mainContent}>
            <div className={styles.dateFilters}>{filters}</div>

            {showLoading && (
                <Group justify="center" p="xl">
                    <Loader />
                </Group>
            )}

            {hasResults && !showLoading && (
                <>
                    <div className={styles.chartContainer}>{chart}</div>
                    <div className={styles.tableContainer}>{table}</div>
                    <GeneratedSql sql={sql} durationMs={durationMs} />
                </>
            )}

            {!hasResults && !isLoading && (
                <Stack align="center" justify="center" h="100%" gap="md">
                    <Text c="dimmed" ta="center">
                        {emptyMessage}
                    </Text>
                </Stack>
            )}
        </div>
    );
};
