import { type RawResultRow, type ResultRow } from '@lightdash/common';
import { Center, Loader, Paper, Stack } from '@mantine/core';
import { useEffect, useMemo, type FC, type ReactNode } from 'react';
import { ROW_HEIGHT_PX } from '../../../../../components/common/Table/constants';
import { ChartDataTable } from '../../../../../components/DataViz/visualizations/ChartDataTable';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import styles from './AiArtifactTableVisualization.module.css';
import { getAiArtifactTableConfig } from './AiArtifactTableVisualization.utils';

const TABLE_HEADER_HEIGHT_PX = 34;

const unwrapRows = (rows: ResultRow[]): RawResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value.value.raw]),
        ),
    );

type Props = {
    results: InfiniteQueryResults;
    headerContent: ReactNode;
    loadingMessage: string;
};

export const AiArtifactTableVisualization: FC<Props> = ({
    results,
    headerContent,
    loadingMessage,
}) => {
    const columns = useMemo(
        () => Object.values(results.columns ?? {}),
        [results.columns],
    );
    const columnNames = useMemo(
        () => columns.map((column) => column.reference),
        [columns],
    );
    const rows = useMemo(() => unwrapRows(results.rows), [results.rows]);

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    if (
        results.isInitialLoading ||
        results.isFetchingFirstPage ||
        columns.length === 0
    ) {
        return (
            <Center h={300}>
                <Loader
                    type="dots"
                    color="ldGray.6"
                    delayedMessage={loadingMessage}
                />
            </Center>
        );
    }

    const contentHeight = TABLE_HEADER_HEIGHT_PX + rows.length * ROW_HEIGHT_PX;

    return (
        <Stack gap="md" h="100%" mih={0}>
            {headerContent}
            <Paper
                h={contentHeight}
                mah="100%"
                mih={0}
                pos="relative"
                radius="md"
                bg="ldGray.0"
                className={styles.tableContainer}
            >
                <ChartDataTable
                    columnNames={columnNames}
                    rows={rows}
                    columnsConfig={getAiArtifactTableConfig(columns).columns}
                    flexProps={{ h: '100%', mah: '100%' }}
                />
            </Paper>
        </Stack>
    );
};
