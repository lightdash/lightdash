import { Center, Loader, Paper, Stack } from '@mantine/core';
import { clsx } from 'clsx';
import { useMemo, type FC, type ReactNode } from 'react';
import { ROW_HEIGHT_PX } from '../../../../../components/common/Table/constants';
import { ChartDataTable } from '../../../../../components/DataViz/visualizations/ChartDataTable';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import styles from './AiArtifactTableVisualization.module.css';
import { getAiArtifactTableConfig } from './AiArtifactTableVisualization.utils';
import { useArtifactResultRows } from './useArtifactResultRows';

const TABLE_HEADER_HEIGHT_PX = 34;

type Props = {
    results: InfiniteQueryResults;
    headerContent: ReactNode;
    loadingMessage: string;
    /** Edge to edge: no radius, no side or bottom borders. */
    flush?: boolean;
};

export const AiArtifactTableVisualization: FC<Props> = ({
    results,
    headerContent,
    loadingMessage,
    flush = false,
}) => {
    const { columns, rows, isLoading } = useArtifactResultRows(results);
    const columnNames = useMemo(
        () => columns.map((column) => column.reference),
        [columns],
    );

    if (isLoading) {
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
                radius={flush ? 0 : 'md'}
                bg="ldGray.0"
                className={clsx(styles.tableContainer, flush && styles.flush)}
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
