import {
    type ExternalSourceRef,
    type ExternalSourceTablePreview,
    type ResultColumn,
} from '@lightdash/common';
import { Badge, Drawer, Group, Loader, Stack, Tabs, Text } from '@mantine/core';
import { IconColumns3, IconEye, IconTable } from '@tabler/icons-react';
import { useMemo, useRef, type FC } from 'react';
import LightTable from '../../../components/common/LightTable';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { ColumnWindowColGroup } from '../../../components/common/Table/ColumnWindowColGroup';
import {
    renderColumns,
    useColumnWindow,
} from '../../../components/common/Table/useColumnWindow';
import { useExternalSourceTablePreview } from '../hooks/useExternalSources';
import classes from './SourceTablePreviewDrawer.module.css';

const formatCell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
};

type Props = {
    projectUuid: string;
    sourceRef: ExternalSourceRef | undefined;
    tableLabel: string;
    onClose: () => void;
};

const SourcePreviewTable: FC<{
    columns: ResultColumn[];
    rows: ExternalSourceTablePreview['sampleRows'];
}> = ({ columns, rows }) => {
    const viewport = useRef<HTMLDivElement>(null);
    const layout = useMemo(
        () => columns.map(({ reference }) => ({ id: reference, width: 150 })),
        [columns],
    );
    const columnWindow = useColumnWindow(viewport, layout);
    return (
        <LightTable
            containerRef={viewport}
            w={columnWindow ? `${columnWindow.width}px` : '100%'}
            miw="100%"
            aria-colcount={columns.length}
            className={`sentry-block ph-no-capture ${columnWindow ? classes.windowed : ''}`}
        >
            <ColumnWindowColGroup columnWindow={columnWindow} />
            <LightTable.Head withSticky>
                <LightTable.Row index={0}>
                    {renderColumns(columnWindow, columns.length, (i) => {
                        const { reference } = columns[i];
                        return (
                            <LightTable.CellHead
                                key={reference}
                                aria-colindex={i + 1}
                                withBoldFont
                                withValue={reference}
                            >
                                {reference}
                            </LightTable.CellHead>
                        );
                    })}
                </LightTable.Row>
            </LightTable.Head>
            <LightTable.Body>
                {rows.map((row, rowIndex) => (
                    <LightTable.Row key={rowIndex} index={rowIndex}>
                        {renderColumns(columnWindow, columns.length, (i) => {
                            const { reference } = columns[i];
                            const value = formatCell(row[reference]);
                            return (
                                <LightTable.Cell
                                    key={reference}
                                    aria-colindex={i + 1}
                                    withInteractions
                                    withValue={value}
                                    withTooltip={value}
                                >
                                    {value}
                                </LightTable.Cell>
                            );
                        })}
                    </LightTable.Row>
                ))}
            </LightTable.Body>
        </LightTable>
    );
};

export const SourceTablePreviewDrawer: FC<Props> = ({
    projectUuid,
    sourceRef,
    tableLabel,
    onClose,
}) => {
    const columnsTableRef = useRef<HTMLDivElement>(null);
    const previewResult = useExternalSourceTablePreview({
        projectUuid,
        sourceUuid: sourceRef?.sourceUuid,
        tableUuid: sourceRef?.tableUuid,
    });
    const preview = previewResult.data;
    const columns = useMemo(
        () => Object.values(preview?.columns ?? {}),
        [preview?.columns],
    );

    return (
        <Drawer
            opened={!!sourceRef}
            onClose={onClose}
            position="right"
            size={640}
            title={
                <Group gap="xs" wrap="nowrap">
                    <MantineIcon icon={IconTable} color="ldGray.7" />
                    <Text fw={600} fz="sm">
                        {tableLabel}
                    </Text>
                </Group>
            }
        >
            {previewResult.isInitialLoading && (
                <Stack align="center" py="xl">
                    <Loader size="sm" />
                </Stack>
            )}
            {previewResult.isError && (
                <SuboptimalState
                    icon={IconTable}
                    title="Couldn't load the preview"
                    description={previewResult.error.error.message}
                />
            )}
            {preview && (
                <Tabs defaultValue="preview" keepMounted={false}>
                    <Tabs.List>
                        <Tabs.Tab
                            value="preview"
                            leftSection={
                                <MantineIcon icon={IconEye} size="sm" />
                            }
                        >
                            Data preview
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="columns"
                            leftSection={
                                <MantineIcon icon={IconColumns3} size="sm" />
                            }
                        >
                            Columns · {columns.length}
                        </Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="preview" pt="md" keepMounted>
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Text fz="xs" c="dimmed">
                                    First {preview.sampleRows.length} rows
                                </Text>
                                <Badge size="xs">Read only</Badge>
                            </Group>
                            <SourcePreviewTable
                                columns={columns}
                                rows={preview.sampleRows}
                            />
                        </Stack>
                    </Tabs.Panel>
                    <Tabs.Panel value="columns" pt="md">
                        <LightTable
                            containerRef={columnsTableRef}
                            w="100%"
                            miw="100%"
                        >
                            <LightTable.Head withSticky>
                                <LightTable.Row index={0}>
                                    <LightTable.CellHead withBoldFont>
                                        Column
                                    </LightTable.CellHead>
                                    <LightTable.CellHead withBoldFont>
                                        Type
                                    </LightTable.CellHead>
                                </LightTable.Row>
                            </LightTable.Head>
                            <LightTable.Body>
                                {columns.map((column, index) => (
                                    <LightTable.Row
                                        key={column.reference}
                                        index={index}
                                    >
                                        <LightTable.Cell
                                            withInteractions
                                            withValue={column.reference}
                                        >
                                            {column.reference}
                                        </LightTable.Cell>
                                        <LightTable.Cell
                                            withInteractions
                                            withValue={column.type}
                                        >
                                            {column.type}
                                        </LightTable.Cell>
                                    </LightTable.Row>
                                ))}
                            </LightTable.Body>
                        </LightTable>
                    </Tabs.Panel>
                </Tabs>
            )}
        </Drawer>
    );
};
