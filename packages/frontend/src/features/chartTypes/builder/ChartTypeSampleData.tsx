import {
    normalizeIndexColumns,
    type DataAppVizContext,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../components/common/ContentTable';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { type ChartTypePreviewDataSource } from './ChartInputsList';
import classes from './ChartTypeSampleData.module.css';

const SAMPLE_SOURCE: ChartTypePreviewDataSource = { kind: 'sample' };

type Column = { reference: string; label: string };
type SampleRow = DataAppVizContext['rows'][number];

/** The rows a modal lists, with a label per column; independent of a schema
 *  so a query can be inspected before any version exists. */
export type ChartTypeRows = {
    rows: DataAppVizContext['rows'];
    pivotDetails: DataAppVizContext['pivotDetails'];
    labels: Record<string, string>;
};

const rowsFromVizContext = (context: DataAppVizContext): ChartTypeRows => ({
    rows: context.rows,
    pivotDetails: context.pivotDetails,
    labels: Object.fromEntries(
        Object.entries(context.fields).map(([id, field]) => [id, field.label]),
    ),
});

const getColumns = ({
    rows,
    pivotDetails,
    labels,
}: ChartTypeRows): Column[] => {
    if (!pivotDetails) {
        return Object.keys(rows[0] ?? {}).map((reference) => ({
            reference,
            label: labels[reference] ?? reference,
        }));
    }

    const indexColumns = normalizeIndexColumns(pivotDetails.indexColumn).map(
        ({ reference }) => ({
            reference,
            label:
                labels[reference] ??
                pivotDetails.originalColumns[reference]?.label ??
                reference,
        }),
    );
    const valueColumns = pivotDetails.valuesColumns.map((column) => ({
        reference: column.pivotColumnName,
        label: [
            labels[column.referenceField] ??
                pivotDetails.originalColumns[column.referenceField]?.label ??
                column.referenceField,
            ...column.pivotValues.map((value) => value.formatted),
        ].join(' · '),
    }));

    return [...indexColumns, ...valueColumns];
};

const cellValue = (value: SampleRow[string]) => value?.value.formatted ?? '';

type ModalProps = {
    data: ChartTypeRows | null;
    opened: boolean;
    onClose: () => void;
    title: string;
    subtitle: string;
};

/** Every row behind the preview, in a modal the host opens. */
export const ChartTypeRowsModal: FC<ModalProps> = ({
    data,
    opened,
    onClose,
    title,
    subtitle,
}) => {
    const availableColumns = useMemo(
        () => (data ? getColumns(data) : []),
        [data],
    );
    const columns = useMemo<ContentTableColumnDef<SampleRow>[]>(
        () =>
            availableColumns.map((column) => ({
                id: column.reference,
                header: column.label,
                accessorFn: (row) => cellValue(row[column.reference]),
                enableSorting: false,
            })),
        [availableColumns],
    );
    const table = useContentTable({
        columns,
        data: data?.rows ?? [],
        enableBottomToolbar: false,
        enableColumnResizing: false,
        enableEditing: false,
        enablePagination: false,
        enableRowActions: false,
        enableRowSelection: false,
        enableSorting: false,
        enableTopToolbar: false,
        mantineTableContainerProps: {
            className: classes.tableContainer,
            role: 'region',
            tabIndex: 0,
            'aria-label': 'Generated sample data rows',
        },
        mantineTableProps: {
            'aria-label': 'Generated sample data',
            highlightOnHover: true,
        },
    });
    if (!data || availableColumns.length === 0) return null;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            size="min(1200px, 90vw)"
        >
            <ContentTable table={table} />
        </MantineModal>
    );
};

type Props = {
    context: DataAppVizContext | null;
    /** Defaults to the fabricated sample every chart type falls back to. */
    dataSource?: ChartTypePreviewDataSource;
};

export const ChartTypeSampleData: FC<Props> = ({
    context,
    dataSource = SAMPLE_SOURCE,
}) => {
    const [opened, setOpened] = useState(false);
    const rows = useMemo(
        () => (context ? rowsFromVizContext(context) : null),
        [context],
    );
    if (!context || context.rows.length === 0) return null;

    const isLive = dataSource.kind === 'live';
    const rowLabel = context.rows.length === 1 ? 'row' : 'rows';
    const launcherLabel = `${
        isLive ? 'View data' : 'View sample data'
    } · ${context.rows.length} ${rowLabel}`;

    return (
        <>
            <Button
                variant="subtle"
                size="compact-xs"
                className={classes.launcher}
                leftSection={<MantineIcon icon={IconTable} size={14} />}
                onClick={() => setOpened(true)}
            >
                {launcherLabel}
            </Button>
            <ChartTypeRowsModal
                data={rows}
                opened={opened}
                onClose={() => setOpened(false)}
                title={isLive ? 'Preview data' : 'Sample data'}
                subtitle={
                    isLive
                        ? 'Rows returned by the saved chart this preview runs on.'
                        : 'Generated example values used in this preview.'
                }
            />
        </>
    );
};
