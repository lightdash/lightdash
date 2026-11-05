import { Group, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState, type FC } from 'react';
import { useAppSelector } from '../store';
import {
    selectQueryLoading,
    selectResults,
} from '../store/retentionBuilderSlice';
import { RetentionCurveChart } from './RetentionCurveChart';
import { RetentionDateFilter } from './RetentionDateFilter';
import { RetentionDebugSql } from './RetentionDebugSql';
import styles from './RetentionMainContent.module.css';
import { RetentionTable } from './RetentionTable';

const LOADING_DEBOUNCE_MS = 200;

type Props = {
    projectUuid: string;
};

export const RetentionMainContent: FC<Props> = ({ projectUuid }) => {
    const results = useAppSelector(selectResults);
    const isLoading = useAppSelector(selectQueryLoading);

    const [showLoading, setShowLoading] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isLoading) {
            timerRef.current = setTimeout(() => {
                setShowLoading(true);
            }, LOADING_DEBOUNCE_MS);
        } else {
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
                <RetentionDateFilter projectUuid={projectUuid} />
            </div>

            {showLoading && (
                <Group justify="center" p="xl">
                    <Loader />
                </Group>
            )}

            {results && !showLoading && (
                <>
                    <div className={styles.chartContainer}>
                        <RetentionCurveChart />
                    </div>

                    <div className={styles.tableContainer}>
                        <RetentionTable />
                    </div>

                    <RetentionDebugSql />
                </>
            )}

            {!results && !isLoading && (
                <Stack align="center" justify="center" h="100%" gap="md">
                    <Text c="dimmed" ta="center">
                        Configure your retention report in the sidebar
                        <br />
                        Select fields and a born event to see results
                    </Text>
                </Stack>
            )}
        </div>
    );
};
