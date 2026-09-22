import {
    getDataAppVizFieldIds,
    type DataAppVizContext,
} from '@lightdash/common';
import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './SavedChartResultsPeek.module.css';
import { type SavedChartSourceControls } from './savedChartSource';

const PEEK_ROWS = 3;

type Props = {
    source: SavedChartSourceControls;
    /** The context on screen; its mapping decides which columns are shown. */
    context: DataAppVizContext | null;
};

/** The mapped columns of the one run, three rows deep, with the way out to
 *  the full result. */
const SavedChartResultsPeek: FC<Props> = ({ source, context }) => {
    const attached = source.attached;
    const columns = useMemo(() => {
        if (!context) return [];
        const ids = [
            ...new Set(
                Object.values(context.fieldMapping).flatMap(
                    getDataAppVizFieldIds,
                ),
            ),
        ];
        return ids.map((id) => ({
            id,
            label: context.fields[id]?.label ?? id,
        }));
    }, [context]);

    if (!attached || attached.status !== 'ready' || !context) return null;
    if (columns.length === 0) return null;

    const rows = context.rows.slice(0, PEEK_ROWS);
    const rowCount = attached.rowCount ?? 0;

    return (
        <Stack gap="xs">
            <Stack gap={2}>
                <Text fz="sm" fw={600}>
                    Query results
                </Text>
                <Text fz="xs" c="dimmed" lh={1.5}>
                    Mapped columns from {attached.chartName}.
                </Text>
            </Stack>
            <Box className={classes.table} role="table">
                <Box className={classes.headerRow} role="row">
                    {columns.map((column) => (
                        <Text
                            key={column.id}
                            className={classes.headerCell}
                            role="columnheader"
                            fz={11}
                            fw={600}
                            truncate
                        >
                            {column.label}
                        </Text>
                    ))}
                </Box>
                {rows.map((row, index) => (
                    <Box
                        // Result rows carry no stable id of their own.
                        key={index}
                        className={classes.row}
                        role="row"
                    >
                        {columns.map((column) => (
                            <Text
                                key={column.id}
                                className={classes.cell}
                                role="cell"
                                fz="xs"
                                truncate
                            >
                                {row[column.id]?.value.formatted ?? ''}
                            </Text>
                        ))}
                    </Box>
                ))}
            </Box>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text fz="xs" c="dimmed">
                    {rowCount} {rowCount === 1 ? 'row' : 'rows'}
                    {attached.ranAt &&
                        ` · ran ${formatDistanceToNow(attached.ranAt, {
                            addSuffix: true,
                        })}`}
                </Text>
                <Button
                    variant="default"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconTable} size={14} />}
                    onClick={source.viewRows}
                >
                    View all
                </Button>
            </Group>
        </Stack>
    );
};

export default SavedChartResultsPeek;
