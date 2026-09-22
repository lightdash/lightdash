import { type Document } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useMemo, type ReactNode } from 'react';
import { UpdatedInfo } from '../../components/common/PageHeader/UpdatedInfo';
import ErrorBoundary from '../errorBoundary/ErrorBoundary';
import DocumentChart from './DocumentChart';
import { getDocumentHeadingId, getDocumentHeadings } from './documentHeadings';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import ReportChartFrame from './presentation/ReportChartFrame';
import ReportMarkdown from './presentation/ReportMarkdown';
import styles from './presentation/ReportPresentation.module.css';

const DocumentRenderer = ({
    document,
    actions,
}: {
    document: Document;
    actions?: ReactNode;
}) => {
    const { cells } = document.version.content;
    const headings = useMemo(() => getDocumentHeadings(cells), [cells]);
    return (
        <DocumentReportLayout
            title={document.name}
            contentsLabel={null}
            headings={headings}
            variant="document"
            actions={actions}
            metadata={
                <UpdatedInfo
                    updatedAt={document.updatedAt}
                    user={null}
                    partiallyBold={false}
                />
            }
        >
            <Stack
                className={`${styles.structuredReport} ${styles.documentCells}`}
            >
                {cells.length === 0 && (
                    <Text c="dimmed">This document is empty.</Text>
                )}
                {cells.map((cell, index) =>
                    cell.type === 'chart' ? (
                        <ErrorBoundary
                            key={`${document.version.versionUuid}:${index}`}
                            fallbackWrapper={(fallback) => (
                                <ReportChartFrame
                                    title={cell.content.chart.name}
                                >
                                    {fallback}
                                </ReportChartFrame>
                            )}
                        >
                            <DocumentChart
                                showTitle
                                projectUuid={document.projectUuid}
                                spaceUuid={document.spaceUuid}
                                documentUuid={document.documentUuid}
                                versionUuid={document.version.versionUuid}
                                cellIndex={index}
                                cell={cell}
                            />
                        </ErrorBoundary>
                    ) : cell.type === 'markdown' ? (
                        <ErrorBoundary
                            key={`${document.version.versionUuid}:${index}`}
                        >
                            <ReportMarkdown
                                markdown={cell.content.markdown}
                                headingId={(offset) =>
                                    getDocumentHeadingId(index, offset)
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
