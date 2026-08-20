import { type ExternalSourceRef } from '@lightdash/common';
import {
    Badge,
    Box,
    Drawer,
    Group,
    Loader,
    Stack,
    Tabs,
    Text,
} from '@mantine/core';
import { IconColumns3, IconEye, IconTable } from '@tabler/icons-react';
import { useRef, type FC } from 'react';
import LightTable from '../../../components/common/LightTable';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useExternalSourceTablePreview } from '../hooks/useExternalSources';

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

export const SourceTablePreviewDrawer: FC<Props> = ({
    projectUuid,
    sourceRef,
    tableLabel,
    onClose,
}) => {
    const previewTableRef = useRef<HTMLDivElement>(null);
    const columnsTableRef = useRef<HTMLDivElement>(null);
    const previewResult = useExternalSourceTablePreview({
        projectUuid,
        sourceUuid: sourceRef?.sourceUuid,
        tableUuid: sourceRef?.tableUuid,
    });
    const preview = previewResult.data;
    const columns = preview ? Object.values(preview.columns) : [];

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
                <Tabs defaultValue="preview">
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
                    <Tabs.Panel value="preview" pt="md">
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Text fz="xs" c="dimmed">
                                    First {preview.sampleRows.length} rows
                                </Text>
                                <Badge variant="light" color="gray" size="xs">
                                    Read only
                                </Badge>
                            </Group>
                            <Box style={{ overflowX: 'auto' }}>
                                <LightTable
                                    containerRef={previewTableRef}
                                    w="100%"
                                    miw="100%"
                                    className="sentry-block ph-no-capture"
                                >
                                    <LightTable.Head withSticky>
                                        <LightTable.Row index={0}>
                                            {columns.map((column) => (
                                                <LightTable.CellHead
                                                    key={column.reference}
                                                    withBoldFont
                                                    withValue={column.reference}
                                                >
                                                    {column.reference}
                                                </LightTable.CellHead>
                                            ))}
                                        </LightTable.Row>
                                    </LightTable.Head>
                                    <LightTable.Body>
                                        {preview.sampleRows.map(
                                            (row, rowIndex) => (
                                                <LightTable.Row
                                                    key={rowIndex}
                                                    index={rowIndex}
                                                >
                                                    {columns.map((column) => {
                                                        const value =
                                                            formatCell(
                                                                row[
                                                                    column
                                                                        .reference
                                                                ],
                                                            );
                                                        return (
                                                            <LightTable.Cell
                                                                key={
                                                                    column.reference
                                                                }
                                                                withInteractions
                                                                withValue={
                                                                    value
                                                                }
                                                                withTooltip={
                                                                    value
                                                                }
                                                            >
                                                                {value}
                                                            </LightTable.Cell>
                                                        );
                                                    })}
                                                </LightTable.Row>
                                            ),
                                        )}
                                    </LightTable.Body>
                                </LightTable>
                            </Box>
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
