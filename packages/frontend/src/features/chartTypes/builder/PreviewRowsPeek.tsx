import {
    getDataAppVizFieldIds,
    normalizeIndexColumns,
    type DataAppVizContext,
    type DataAppVizField,
} from '@lightdash/common';
import { Box, Button, Group, Stack, Table, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ColumnWindowColGroup } from '../../../components/common/Table/ColumnWindowColGroup';
import {
    renderColumns,
    useColumnWindow,
} from '../../../components/common/Table/useColumnWindow';
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
    rowCount: number;
    getValue: (rowIndex: number, columnId: string) => string;
};

const SERIES_COLUMN = '__series';

/** The sample, one row per (index, series value) pair, metrics as columns. */
const unpivotSample = (
    fields: DataAppVizField[],
    context: DataAppVizContext,
): DisplayRows => {
    const pivot = context.pivotDetails;
    if (!pivot) {
        const flat = getChartTypeRowColumns(rowsFromVizContext(context));
        return {
            columns: flat.map(({ reference, label }) => ({
                id: reference,
                label,
            })),
            rowCount: context.rows.length,
            getValue: (index, id) =>
                context.rows[index][id]?.value.formatted ?? '',
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
    const columnsBySeries = new Map<string, Map<string, string>>();
    for (const column of pivot.valuesColumns) {
        const series = column.pivotValues
            .map((value) => value.formatted)
            .join(' · ');
        const metrics =
            columnsBySeries.get(series) ?? new Map<string, string>();
        if (!metrics.has(column.referenceField))
            metrics.set(column.referenceField, column.pivotColumnName);
        columnsBySeries.set(series, metrics);
    }
    const seriesValues = [...columnsBySeries.keys()];
    const metricFields = new Set(metricIds);
    return {
        columns: [
            ...indexColumns,
            { id: SERIES_COLUMN, label: seriesLabel },
            ...metricColumns,
        ],
        rowCount: context.rows.length * seriesValues.length,
        getValue: (index, id) => {
            const series = seriesValues[index % seriesValues.length];
            if (id === SERIES_COLUMN) return series;
            const row = context.rows[Math.floor(index / seriesValues.length)];
            const reference = metricFields.has(id)
                ? columnsBySeries.get(series)?.get(id)
                : id;
            return reference ? (row[reference]?.value.formatted ?? '') : '';
        },
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
                rowCount: context.rows.length,
                getValue: (index, id) =>
                    context.rows[index][id]?.value.formatted ?? '',
            };
        }
        return unpivotSample(fields, context);
    }, [context, fields, isChart]);
    const viewport = useRef<HTMLDivElement>(null);
    const layout = useMemo(
        () => display?.columns.map(({ id }) => ({ id, width: 150 })) ?? [],
        [display],
    );
    const columnWindow = useColumnWindow(viewport, layout);
    const sample = useMemo(
        () =>
            context && display && !isChart
                ? {
                      data: rowsFromVizContext(context),
                      summary: sampleSummary(fields, context, display.rowCount),
                  }
                : null,
        [context, display, fields, isChart],
    );
    if (!context || !display || display.columns.length === 0) return null;
    if (isChart && attached?.status !== 'ready') return null;

    const isPivoted = isChart && context.pivotDetails !== null;
    const { columns } = display;
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
        summary = sample?.summary ?? '';
    }

    return (
        <Stack gap="xs">
            <Text component="h3" fz="sm" fw={600}>
                {isChart ? 'Query results' : 'Sample data'}
            </Text>
            <Box
                ref={viewport}
                className={classes.tableViewport}
                role="region"
                aria-label={
                    isChart ? 'Query results preview' : 'Sample data preview'
                }
                tabIndex={0}
            >
                <Table
                    miw={
                        columnWindow
                            ? `${columnWindow.width}px`
                            : isPivoted
                              ? columns.length * 150
                              : undefined
                    }
                    aria-colcount={columns.length}
                    data-pivoted={isPivoted || undefined}
                    className={classes.table}
                    horizontalSpacing={0}
                    verticalSpacing={0}
                >
                    <ColumnWindowColGroup columnWindow={columnWindow} />
                    <Table.Thead className={classes.headerRow}>
                        <Table.Tr>
                            {renderColumns(
                                columnWindow,
                                columns.length,
                                (index) => {
                                    const column = columns[index];
                                    return (
                                        <Table.Th
                                            key={column.id}
                                            aria-colindex={index + 1}
                                            className={classes.headerCell}
                                        >
                                            <Text
                                                component="span"
                                                fz="xs"
                                                fw={500}
                                                truncate={!isPivoted}
                                                lineClamp={
                                                    isPivoted ? 2 : undefined
                                                }
                                                title={column.label}
                                            >
                                                {column.label}
                                            </Text>
                                        </Table.Th>
                                    );
                                },
                            )}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {Array.from(
                            { length: Math.min(display.rowCount, PEEK_ROWS) },
                            (_, index) => (
                                <Table.Tr
                                    // Result rows carry no stable id of their own.
                                    key={index}
                                    className={classes.row}
                                >
                                    {renderColumns(
                                        columnWindow,
                                        columns.length,
                                        (columnIndex) => {
                                            const column = columns[columnIndex];
                                            return (
                                                <Table.Td
                                                    key={column.id}
                                                    aria-colindex={
                                                        columnIndex + 1
                                                    }
                                                    className={classes.cell}
                                                >
                                                    <Text
                                                        component="span"
                                                        fz="xs"
                                                        truncate
                                                    >
                                                        {display.getValue(
                                                            index,
                                                            column.id,
                                                        )}
                                                    </Text>
                                                </Table.Td>
                                            );
                                        },
                                    )}
                                </Table.Tr>
                            ),
                        )}
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
            {sample && (
                <ChartTypeRowsModal
                    data={sample.data}
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
