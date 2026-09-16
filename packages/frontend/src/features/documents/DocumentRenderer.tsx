import { type Document } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useMemo } from 'react';
import ErrorBoundary from '../errorBoundary/ErrorBoundary';
import DocumentChart from './DocumentChart';
import { getDocumentHeadingId, getDocumentHeadings } from './documentHeadings';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import ReportMarkdown from './presentation/ReportMarkdown';
import styles from './presentation/ReportPresentation.module.css';
import ReportSection from './presentation/ReportSection';

const DocumentRenderer = ({ document }: { document: Document }) => {
    const { cells } = document.version.content;
    const headings = useMemo(() => getDocumentHeadings(cells), [cells]);
    return (
        <DocumentReportLayout
            title={document.name}
            eyebrow="Document"
            description={document.description}
            headings={headings}
        >
            <Stack className={styles.structuredReport}>
                {cells.length === 0 && (
                    <Text c="dimmed">This document is empty.</Text>
                )}
                {cells.map((cell, index) =>
                    cell.type === 'chart' ? (
                        <ReportSection
                            key={`${document.version.versionUuid}:${cell.id}`}
                            title={cell.content.chart.name}
                            id={getDocumentHeadingId(cell.id)}
                        >
                            <ErrorBoundary>
                                <DocumentChart
                                    projectUuid={document.projectUuid}
                                    spaceUuid={document.spaceUuid}
                                    documentUuid={document.documentUuid}
                                    versionUuid={document.version.versionUuid}
                                    cell={cell}
                                />
                            </ErrorBoundary>
                        </ReportSection>
                    ) : cell.type === 'markdown' ? (
                        <ErrorBoundary
                            key={`${document.version.versionUuid}:${cell.id}`}
                        >
                            <ReportMarkdown
                                markdown={cell.content.markdown}
                                headingId={(offset) =>
                                    getDocumentHeadingId(cell.id, offset)
                                }
                            />
                        </ErrorBoundary>
                    ) : (
                        <Text
                            key={`${document.version.versionUuid}:${index}`}
                            c="dimmed"
                        >
                            This content type is not supported yet.
                        </Text>
                    ),
                )}
            </Stack>
        </DocumentReportLayout>
    );
};
export default DocumentRenderer;
