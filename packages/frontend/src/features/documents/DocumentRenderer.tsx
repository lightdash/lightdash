import { type Document } from '@lightdash/common';
import { Box, Stack, Text, Title } from '@mantine/core';
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
            <Stack className={styles.structuredReport}>
                {cells.length === 0 && (
                    <Text c="dimmed">This document is empty.</Text>
                )}
                {cells.map((cell, index) => (
                    <Box
                        component="section"
                        className={
                            cell.content.title
                                ? styles.reportFinding
                                : styles.reportIntroduction
                        }
                        key={`${document.version.versionUuid}:${cell.id}`}
                    >
                        {cell.content.title && (
                            <Title
                                order={2}
                                className={styles.reportFindingTitle}
                                id={getDocumentHeadingId(cell.id)}
                                data-report-heading=""
                            >
                                {cell.content.title}
                            </Title>
                        )}
                        <ErrorBoundary>
                            {cell.type === 'markdown' ? (
                                <MarkdownPreview
                                    prefixCls=""
                                    className={`${markdownStyles.aiMarkdown} ${index === 0 && !cell.content.title ? styles.reportIntroductionProse : styles.reportProse}`}
                                    source={cell.content.markdown}
                                    skipHtml
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
                    </Box>
                ))}
            </Stack>
        </DocumentReportLayout>
    );
};

export default DocumentRenderer;
