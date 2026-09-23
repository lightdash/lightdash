import {
    getDataAppVizFieldIds,
    normalizeIndexColumns,
    type DataAppVizContext,
    type DataAppVizField,
} from '@lightdash/common';
import { Box, Button, Group, Stack, Table, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getChartTypeRowColumns, rowsFromVizContext } from './chartTypeRows';
import { ChartTypeRowsModal } from './ChartTypeSampleData';
import { type AttachedExplore } from './exploreSource';
import classes from './PreviewRowsPeek.module.css';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';

const PEEK_ROWS = 3;

/** What the peek reads from whichever source is attached. */
export type PreviewRowsSource = Pick<
    SavedChartSourceControls,
    'previewSource' | 'viewRows'
> & {
    attached:
        | (Pick<AttachedSavedChart, 'rowCount' | 'ranAt'> & {
              status: AttachedSavedChart['status'] | AttachedExplore['status'];
          })
        | null;
};

type Props = {
    source: PreviewRowsSource;
    /** The declared slots; which of them are series and metrics shapes the
     *  sample's summary line. */
    fields: DataAppVizField[];
    /** The context on screen; its mapping decides which columns are shown. */
    context: DataAppVizContext | null;
};

type DisplayRows = {
    columns: { id: string; label: string }[];
    rows: Record<string, string>[];
};

const SERIES_COLUMN = '__series';

/** The sample, one row per (index, series value) pair, metrics as columns. */
const unpivotSample = (
    fields: DataAppVizField[],
    context: DataAppVizContext,
): DisplayRows => {
    const flat = getChartTypeRowColumns(rowsFromVizContext(context));
    const pivot = context.pivotDetails;
    if (!pivot) {
        return {
            columns: flat.map(({ reference, label }) => ({
                id: reference,
                label,
            })),
            rows: context.rows.map((row) =>
                Object.fromEntries(
                    flat.map(({ reference }) => [
                        reference,
                        row[reference]?.value.formatted ?? '',
                    ]),
                ),
            ),
        };
    }
    const indexColumns = normalizeIndexColumns(pivot.indexColumn).map(
        ({ reference }) => ({
            id: reference,
            label:
                context.fields[reference]?.label ??
                pivot.originalColumns[reference]?.label ??
                reference,
        }),
    );
    const metricIds = [
        ...new Set(pivot.valuesColumns.map((column) => column.referenceField)),
    ];
    const metricColumns = metricIds.map((id) => ({
        id,
        label:
            context.fields[id]?.label ?? pivot.originalColumns[id]?.label ?? id,
    }));
    const seriesLabel =
        fields.find((field) => field.type === 'series')?.label ?? 'Series';
    const seriesValues = [
        ...new Set(
            pivot.valuesColumns.map((column) =>
                column.pivotValues.map((value) => value.formatted).join(' · '),
            ),
        ),
    ];
    const rows = context.rows.flatMap((row) =>
        seriesValues.map((series) => ({
            ...Object.fromEntries(
                indexColumns.map(({ id }) => [
                    id,
                    row[id]?.value.formatted ?? '',
                ]),
            ),
            [SERIES_COLUMN]: series,
            ...Object.fromEntries(
                metricIds.map((metricId) => {
                    const column = pivot.valuesColumns.find(
                        (candidate) =>
                            candidate.referenceField === metricId &&
                            candidate.pivotValues
                                .map((value) => value.formatted)
                                .join(' · ') === series,
                    );
                    return [
                        metricId,
                        column
                            ? (row[column.pivotColumnName]?.value.formatted ??
                              '')
                            : '',
                    ];
                }),
            ),
        })),
    );
    return {
        columns: [
            ...indexColumns,
            { id: SERIES_COLUMN, label: seriesLabel },
            ...metricColumns,
        ],
        rows,
    };
};

const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What the sample is made of, the way the author declared it. */
const sampleSummary = (
    fields: DataAppVizField[],
    context: DataAppVizContext,
    rowCount: number,
): string => {
    const idsFor = (type: DataAppVizField['type']) =>
        fields
            .filter((field) => field.type === type)
            .flatMap((field) =>
                getDataAppVizFieldIds(context.fieldMapping[field.name]),
            );
    const seriesIds = idsFor('series');
    const pivot = context.pivotDetails;
    const seriesCount = pivot
        ? new Set(
              pivot.valuesColumns.map((column) =>
                  column.pivotValues.map((value) => value.formatted).join('|'),
              ),
          ).size
        : new Set(
              context.rows.flatMap((row) =>
                  seriesIds.map((id) => row[id]?.value.formatted ?? ''),
              ),
          ).size;
    const metricCount = pivot
        ? new Set(pivot.valuesColumns.map((column) => column.referenceField))
              .size
        : idsFor('metric').length;
    return [
        plural(rowCount, 'row'),
        ...(seriesIds.length > 0 ? [`${seriesCount} series`] : []),
        ...(metricCount > 0 ? [plural(metricCount, 'value')] : []),
    ].join(' · ');
};

/** The rows behind the preview, whichever source they come from: three rows,
 *  what they amount to, and the way out to the full table. */
const PreviewRowsPeek: FC<Props> = ({ source, fields, context }) => {
    const [isSampleModalOpen, setIsSampleModalOpen] = useState(false);
    const isChart = source.previewSource !== 'sample';
    const attached = source.attached;

    // Live pivots use their rendered columns; flat queries show mapped fields.
    // Samples retain their compact long-form layout.
    const display = useMemo<DisplayRows | null>(() => {
        if (!context) return null;
        if (isChart) {
            const ids = [
                ...new Set(
                    Object.values(context.fieldMapping).flatMap(
                        getDataAppVizFieldIds,
                    ),
                ),
            ];
            const columns = context.pivotDetails
                ? getChartTypeRowColumns(rowsFromVizContext(context)).map(
                      ({ reference, label }) => ({ id: reference, label }),
                  )
                : ids.map((id) => ({
                      id,
                      label: context.fields[id]?.label ?? id,
                  }));
            return {
                columns,
                rows: context.rows.map((row) =>
                    Object.fromEntries(
                        columns.map(({ id }) => [
                            id,
                            context.pivotDetails && row[id]?.value.raw == null
                                ? '—'
                                : (row[id]?.value.formatted ?? ''),
                        ]),
                    ),
                ),
            };
        }
        return unpivotSample(fields, context);
    }, [context, fields, isChart]);
    if (!context || !display || display.columns.length === 0) return null;
    if (isChart && attached?.status !== 'ready') return null;

    const isPivoted = isChart && context.pivotDetails !== null;
    const { columns } = display;
    const rows = display.rows.slice(0, PEEK_ROWS);
    let summary: string;
    if (isChart) {
        const rowCount = isPivoted
            ? context.rows.length
            : (attached?.rowCount ?? 0);
        const ran = attached?.ranAt
            ? ` · ran ${formatDistanceToNow(attached.ranAt, {
                  addSuffix: true,
              })}`
            : '';
        summary = `${plural(rowCount, isPivoted ? 'pivoted row' : 'row')}${ran}`;
    } else {
        summary = sampleSummary(fields, context, display.rows.length);
    }

    return (
        <Stack gap="xs">
            <Text component="h3" fz="sm" fw={600}>
                {isChart ? 'Query results' : 'Sample data'}
            </Text>
            <Box
                className={classes.tableViewport}
                role="region"
                aria-label={
                    isChart ? 'Query results preview' : 'Sample data preview'
                }
                tabIndex={0}
            >
                <Table
                    miw={isPivoted ? columns.length * 150 : undefined}
                    data-pivoted={isPivoted || undefined}
                    className={classes.table}
                    horizontalSpacing={0}
                    verticalSpacing={0}
                >
                    <Table.Thead className={classes.headerRow}>
                        <Table.Tr>
                            {columns.map((column) => (
                                <Table.Th
                                    key={column.id}
                                    className={classes.headerCell}
                                >
                                    <Text
                                        component="span"
                                        fz="xs"
                                        fw={500}
                                        truncate={!isPivoted}
                                        lineClamp={isPivoted ? 2 : undefined}
                                        title={column.label}
                                    >
                                        {column.label}
                                    </Text>
                                </Table.Th>
                            ))}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((row, index) => (
                            <Table.Tr
                                // Result rows carry no stable id of their own.
                                key={index}
                                className={classes.row}
                            >
                                {columns.map((column) => (
                                    <Table.Td
                                        key={column.id}
                                        className={classes.cell}
                                    >
                                        <Text component="span" fz="xs" truncate>
                                            {row[column.id] ?? ''}
                                        </Text>
                                    </Table.Td>
                                ))}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Box>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text fz="xs" c="dimmed" truncate>
                    {summary}
                </Text>
                <Button
                    variant="default"
                    size="compact-xs"
                    flex="0 0 auto"
                    leftSection={<MantineIcon icon={IconTable} size={14} />}
                    onClick={
                        isChart
                            ? source.viewRows
                            : () => setIsSampleModalOpen(true)
                    }
                >
                    View all
                </Button>
            </Group>
            {!isChart && (
                <ChartTypeRowsModal
                    data={rowsFromVizContext(context)}
                    opened={isSampleModalOpen}
                    onClose={() => setIsSampleModalOpen(false)}
                    title="Sample data"
                    subtitle="Rows generated from the chart inputs, used until a table or saved chart is attached."
                />
            )}
        </Stack>
    );
};

export default PreviewRowsPeek;
