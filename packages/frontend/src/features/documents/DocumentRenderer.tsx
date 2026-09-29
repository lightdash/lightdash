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
    initialScrollTop,
    onScrollTopChange,
}: {
    document: Document;
    actions?: ReactNode;
    /** Replaces the default creator byline. */
    metadata?: ReactNode;
    /** Replaces the contents rail. */
    rail?: ReactNode;
    initialScrollTop?: number;
    onScrollTopChange?: (scrollTop: number) => void;
}) => {
    const { cells } = document.version.content;
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
            initialScrollTop={initialScrollTop}
            onScrollTopChange={onScrollTopChange}
        >
            {cells.length === 0 ? (
                <Text c="dimmed">This document is empty.</Text>
            ) : (
                <DocumentEditorProvider value={target}>
                    <Box role="presentation" {...mentions}>
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
