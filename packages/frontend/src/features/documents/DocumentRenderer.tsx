import { type Document } from '@lightdash/common';
import { Box, Text } from '@mantine/core';
import { EditorContent } from '@tiptap/react';
import { useMemo, type ReactNode } from 'react';
import DocumentByline from './DocumentByline';
import { DocumentEditorProvider } from './editor/DocumentEditorContext';
import { useDocumentReader } from './editor/useDocumentEditor';
import { useMentionNavigation } from './editor/useMentionNavigation';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import styles from './presentation/ReportPresentation.module.css';

const DocumentRenderer = ({
    document,
    actions,
    metadata,
    rail,
    showContents = true,
    initialScrollTop,
    onScrollTopChange,
}: {
    document: Document;
    actions?: ReactNode;
    /** Replaces the default creator byline. */
    metadata?: ReactNode;
    /** Replaces the contents rail. */
    rail?: ReactNode;
    /** False drops the contents rail, e.g. in a narrow side panel. */
    showContents?: boolean;
    initialScrollTop?: number;
    onScrollTopChange?: (scrollTop: number) => void;
}) => {
    const isEmpty = document.version.content.markdown.trim() === '';
    const { editor, headings } = useDocumentReader(document);
    const mentions = useMentionNavigation(editor, document.projectUuid);
    const target = useMemo(
        () => ({
            projectUuid: document.projectUuid,
            spaceUuid: document.spaceUuid,
            documentUuid: document.documentUuid,
            versionUuid: document.version.versionUuid,
        }),
        [
            document.projectUuid,
            document.spaceUuid,
            document.documentUuid,
            document.version.versionUuid,
        ],
    );
    return (
        <DocumentReportLayout
            title={document.name}
            contentsLabel={null}
            headings={headings}
            variant="document"
            actions={actions}
            metadata={metadata ?? <DocumentByline document={document} />}
            rail={rail}
            showContents={showContents}
            initialScrollTop={initialScrollTop}
            onScrollTopChange={onScrollTopChange}
        >
            {isEmpty ? (
                <Text c="dimmed">This document is empty.</Text>
            ) : (
                <DocumentEditorProvider value={target}>
                    <Box
                        role="presentation"
                        {...mentions}
                        // Walkthrough: write a document with a live chart.
                        // See scripts/scope-tours.
                        data-tour-scope="manage:Document"
                        data-tour-step="1"
                        data-tour-route="/projects/:projectUuid/documents/:documentUuidOrSlug"
                        data-tour-label="Your document, saved with its chart"
                        data-tour-docs="explore/documents.mdx#intro:1"
                        data-tour-return="none"
                        data-tour-busy='[data-tour-anchor="document-chart-loading"]'
                        data-tour-resultdocs="explore/documents.mdx#version-history:1"
                    >
                        <EditorContent
                            editor={editor}
                            className={styles.documentProse}
                        />
                    </Box>
                </DocumentEditorProvider>
            )}
        </DocumentReportLayout>
    );
};
export default DocumentRenderer;
