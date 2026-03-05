import { Group, Loader, Stack, Text } from '@mantine-8/core';
import { useEffect, useRef, useState, type FC } from 'react';
import { useAppSelector } from '../store';
import { selectQueryLoading, selectResults } from '../store/funnelBuilderSlice';
import { FunnelBarChart } from './FunnelBarChart';
import { FunnelDateFilter } from './FunnelDateFilter';
import { FunnelDebugSql } from './FunnelDebugSql';
import styles from './FunnelMainContent.module.css';
import { FunnelResultsTable } from './FunnelResultsTable';

const LOADING_DEBOUNCE_MS = 200;

export const FunnelMainContent: FC = () => {
    const results = useAppSelector(selectResults);
    const isLoading = useAppSelector(selectQueryLoading);

    // Debounced loading state to avoid quick UI flashes
    const [showLoading, setShowLoading] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isLoading) {
            // Delay showing loading indicator
            timerRef.current = setTimeout(() => {
                setShowLoading(true);
            }, LOADING_DEBOUNCE_MS);
        } else {
            // Immediately hide loading when done
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            setShowLoading(false);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [isLoading]);

    return (
        <div className={styles.mainContent}>
            <div className={styles.dateFilters}>
                <FunnelDateFilter />
            </div>

            {showLoading && (
                <Group justify="center" p="xl">
                    <Loader />
                </Group>
            )}

            {results && !showLoading && (
                <>
                    <div className={styles.chartContainer}>
                        <FunnelBarChart />
                    </div>

                    <div className={styles.tableContainer}>
                        <FunnelResultsTable />
                    </div>

                    <FunnelDebugSql />
                </>
            )}

            {!results && !isLoading && (
                <Stack align="center" justify="center" h="100%" gap="md">
                    <Text c="dimmed" ta="center">
                        Configure your funnel in the sidebar
                        <br />
                        Select fields and add at least 2 steps to see results
                    </Text>
                </Stack>
            )}
        </div>
    );
};
