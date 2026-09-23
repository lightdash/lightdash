import { type DataAppVizContext } from '@lightdash/common';
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
import {
    getChartTypeRowColumns,
    rowsFromVizContext,
    type ChartTypeRows,
} from './chartTypeRows';
import classes from './ChartTypeSampleData.module.css';

const SAMPLE_SOURCE: ChartTypePreviewDataSource = { kind: 'sample' };

type SampleRow = DataAppVizContext['rows'][number];

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
        () => (data ? getChartTypeRowColumns(data) : []),
        [data],
    );
    const columns = useMemo<ContentTableColumnDef<SampleRow>[]>(
        () =>
            availableColumns.map((column) => ({
                id: column.reference,
                header: column.label,
                Header: () => (
                    <span className={classes.columnHeader}>{column.label}</span>
                ),
                size: Math.max(
                    180,
                    Math.min(360, column.label.length * 7 + 32),
                ),
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
    if (!rows || getChartTypeRowColumns(rows).length === 0) return null;

    const isLive = dataSource.kind === 'live';
    const rowLabel = rows.rows.length === 1 ? 'row' : 'rows';
    const launcherLabel = `${
        isLive ? 'View data' : 'View sample data'
    } · ${rows.rows.length} ${rowLabel}`;

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
                title={isLive ? 'Query results' : 'Sample data'}
                subtitle={
                    isLive
                        ? 'Rows returned by the saved chart this chart runs on.'
                        : 'Generated example values used in this preview.'
                }
            />
        </>
    );
};
