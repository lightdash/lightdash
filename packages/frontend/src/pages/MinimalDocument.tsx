import { DOCUMENT_EXPORT_CLASS, type Document } from '@lightdash/common';
import { Box, Stack, Text, Title } from '@mantine/core';
import { EditorContent } from '@tiptap/react';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import ScreenshotReadyIndicator from '../components/common/ScreenshotReadyIndicator';
import DocumentByline from '../features/documents/DocumentByline';
import {
    DocumentExportStatusContext,
    type DocumentExportStatus,
} from '../features/documents/documentExportStatus';
import { DocumentEditorProvider } from '../features/documents/editor/DocumentEditorContext';
import { useDocumentReader } from '../features/documents/editor/useDocumentEditor';
import styles from '../features/documents/presentation/ReportPresentation.module.css';
import { useDocumentVersion } from '../features/documents/useDocumentVersions';
import { useProjectUuid } from '../hooks/useProjectUuid';

type ChartOutcome = 'ready' | 'errored';

const DocumentPrint = ({ document }: { document: Document }) => {
    const { cells } = document.version.content;
    const { editor } = useDocumentReader(document);
    const [outcomes, setOutcomes] = useState<Record<number, ChartOutcome>>({});
    const exportStatus = useMemo<DocumentExportStatus>(
        () => ({
            // An error is final; a later ready signal never hides it
            markReady: (cellIndex) =>
                setOutcomes((current) =>
                    current[cellIndex]
                        ? current
                        : { ...current, [cellIndex]: 'ready' },
                ),
            markErrored: (cellIndex) =>
                setOutcomes((current) => ({
                    ...current,
                    [cellIndex]: 'errored',
                })),
        }),
        [],
    );
    const target = useMemo(
        () => ({
            projectUuid: document.projectUuid,
            spaceUuid: document.spaceUuid,
            documentUuid: document.documentUuid,
            versionUuid: document.version.versionUuid,
        }),
        [document],
    );
    const chartCellIndexes = cells.flatMap((cell, index) =>
        cell.type === 'chart' ? [index] : [],
    );
    const chartOutcomes = chartCellIndexes.map((index) => outcomes[index]);
    const isSettled = editor !== null && chartOutcomes.every(Boolean);
    return (
        <Box
            className={`${styles.documentLayout} ${styles.documentExport} ${DOCUMENT_EXPORT_CLASS}`}
        >
            <Box component="article" className={styles.report}>
                <Stack gap="xl" className={styles.reportContent}>
                    <Box component="header" className={styles.reportHeader}>
                        <Title order={1} className={styles.reportTitle}>
                            {document.name}
                        </Title>
                        <DocumentByline document={document} />
                    </Box>
                    {cells.length === 0 ? (
                        <Text c="dimmed">This document is empty.</Text>
                    ) : (
                        <DocumentExportStatusContext.Provider
                            value={exportStatus}
                        >
                            <DocumentEditorProvider value={target}>
                                <EditorContent
                                    editor={editor}
                                    className={styles.documentProse}
                                />
                            </DocumentEditorProvider>
                        </DocumentExportStatusContext.Provider>
                    )}
                </Stack>
            </Box>
            {isSettled && (
                <ScreenshotReadyIndicator
                    tilesTotal={chartCellIndexes.length}
                    tilesReady={
                        chartOutcomes.filter((outcome) => outcome === 'ready')
                            .length
                    }
                    tilesErrored={
                        chartOutcomes.filter((outcome) => outcome === 'errored')
                            .length
                    }
                />
            )}
        </Box>
    );
};

/**
 * The saved Document version the headless browser prints to PDF; signals ready
 * once every chart has drawn or failed, and failure when it can't load.
 */
const MinimalDocument = () => {
    const projectUuid = useProjectUuid();
    const { documentUuid } = useParams<{ documentUuid: string }>();
    const [searchParams] = useSearchParams();
    const versionUuid = searchParams.get('versionUuid');
    const query = useDocumentVersion(
        projectUuid ?? '',
        documentUuid ?? '',
        projectUuid && documentUuid ? versionUuid : null,
    );
    if (!projectUuid || !documentUuid || !versionUuid || query.isError) {
        // The export root is still rendered so the backend finds the page at once
        return (
            <Box className={DOCUMENT_EXPORT_CLASS}>
                <ScreenshotReadyIndicator
                    failed
                    tilesTotal={0}
                    tilesReady={0}
                    tilesErrored={0}
                />
            </Box>
        );
    }
    if (!query.data) {
        return null;
    }
    return <DocumentPrint document={query.data} />;
};

export default MinimalDocument;
