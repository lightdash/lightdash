import {
    ChartKind,
    type RawResultRow,
    type ResultColumn,
    type ResultRow,
    type VizTableConfig,
} from '@lightdash/common';
import { Center, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconClockOff } from '@tabler/icons-react';
import { useEffect, useMemo, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { ROW_HEIGHT_PX } from '../../../../../components/common/Table/constants';
import { ChartDataTable } from '../../../../../components/DataViz/visualizations/ChartDataTable';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';

const unwrapRows = (rows: ResultRow[]): RawResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value.value.raw]),
        ),
    );

// Same shrink-to-fit behavior as the SQL artifact table: a compact chat panel
// reads as broken with a mostly-empty card.
const MAX_SHRINK_TO_FIT_HEIGHT_PX = 300;
const TABLE_HEADER_HEIGHT_PX = 34;

const getTableConfig = (columns: ResultColumn[]): VizTableConfig => ({
    metadata: { version: 1 },
    type: ChartKind.TABLE,
    columns: Object.fromEntries(
        columns.map((column) => [
            column.reference,
            {
                visible: true,
                reference: column.reference,
                label: column.reference,
                frozen: false,
            },
        ]),
    ),
    display: undefined,
});

type ContentProps = {
    results: InfiniteQueryResults;
    headerContent: ReactNode;
};

/**
 * v0 composer artifact rendering: a table straight from the stored
 * lastQueryUuid. Results are creator-scoped and expire, so a failed fetch is
 * an intentional empty state rather than an error card.
 */
export const AiComposerArtifactVisualization: FC<ContentProps> = ({
    results,
    headerContent,
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
        if (!results.hasFetchedAllRows && !results.fetchAll && !results.error) {
            results.setFetchAll(true);
        }
    }, [results]);

    if (results.error) {
        return (
            <Stack gap="md" h="100%" mih={300}>
                {headerContent}
                <Center flex={1}>
                    <Stack gap="xs" align="center" justify="center">
                        <MantineIcon icon={IconClockOff} color="gray" />
                        <Text size="xs" c="dimmed" ta="center">
                            These results have expired — ask the agent to re-run
                            this query
                        </Text>
                    </Stack>
                </Center>
            </Stack>
        );
    }

    if (
        results.isInitialLoading ||
        results.isFetchingFirstPage ||
        columns.length === 0
    ) {
        return (
            <Center h={300}>
                <Loader
                    type="dots"
                    color="gray"
                    delayedMessage="Loading composer query results..."
                />
            </Center>
        );
    }

    const estimatedContentHeight =
        TABLE_HEADER_HEIGHT_PX + rows.length * ROW_HEIGHT_PX;
    const shrinkToFit = estimatedContentHeight <= MAX_SHRINK_TO_FIT_HEIGHT_PX;

    return (
        <Stack
            gap="md"
            h={shrinkToFit ? undefined : '100%'}
            mih={shrinkToFit ? undefined : 300}
        >
            {headerContent}
            <Paper
                flex={shrinkToFit ? undefined : 1}
                mah={shrinkToFit ? estimatedContentHeight : undefined}
                mih={0}
                pos="relative"
                withBorder
                radius="md"
                bg="ldGray.0"
                style={{ overflow: 'hidden' }}
            >
                <ChartDataTable
                    columnNames={columnNames}
                    rows={rows}
                    columnsConfig={getTableConfig(columns).columns}
                    flexProps={{ mah: '100%' }}
                />
            </Paper>
        </Stack>
    );
};
