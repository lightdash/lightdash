import { type Document } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useMemo } from 'react';
import markdownStyles from '../../components/common/AiMarkdown/AiMarkdown.module.css';
import { markdownSanitizeRehypePlugins } from '../../utils/markdownUtils';
import ErrorBoundary from '../errorBoundary/ErrorBoundary';
import DocumentChart from './DocumentChart';
import { getDocumentHeadingId, getDocumentHeadings } from './documentHeadings';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import styles from './presentation/ReportPresentation.module.css';

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
            <Stack gap="xl">
                {cells.length === 0 && (
                    <Text c="dimmed">This document is empty.</Text>
                )}
                {cells.map((cell) => (
                    <ErrorBoundary
                        key={`${document.version.versionUuid}:${cell.id}`}
                    >
                        {cell.type === 'markdown' ? (
                            <MarkdownPreview
                                prefixCls=""
                                className={`${markdownStyles.aiMarkdown} ${styles.reportProse}`}
                                source={cell.content}
                                skipHtml
                                components={{
                                    h1: ({ node, children, ...props }) => (
                                        <h1
                                            {...props}
                                            id={getDocumentHeadingId(
                                                cell.id,
                                                node?.position?.start.offset ??
                                                    0,
                                            )}
                                            data-report-heading=""
                                        >
                                            {children}
                                        </h1>
                                    ),
                                    h2: ({ node, children, ...props }) => (
                                        <h2
                                            {...props}
                                            id={getDocumentHeadingId(
                                                cell.id,
                                                node?.position?.start.offset ??
                                                    0,
                                            )}
                                            data-report-heading=""
                                        >
                                            {children}
                                        </h2>
                                    ),
                                }}
                                pluginsFilter={(type, plugins) =>
                                    type === 'rehype'
                                        ? markdownSanitizeRehypePlugins
                                        : plugins
                                }
                            />
                        ) : cell.type === 'chart' &&
                          (cell.content.source === 'semantic' ||
                              cell.content.source === 'merge') ? (
                            <DocumentChart
                                projectUuid={document.projectUuid}
                                spaceUuid={document.spaceUuid}
                                documentUuid={document.documentUuid}
                                versionUuid={document.version.versionUuid}
                                cell={cell}
                            />
                        ) : (
                            <Text c="dimmed">
                                This content type is not supported yet.
                            </Text>
                        )}
                    </ErrorBoundary>
                ))}
            </Stack>
        </DocumentReportLayout>
    );
};

export default DocumentRenderer;
