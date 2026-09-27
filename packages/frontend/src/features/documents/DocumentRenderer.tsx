import { type Document } from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import { EditorContent } from '@tiptap/react';
import { useMemo, type ReactNode } from 'react';
import { LightdashUserAvatar } from '../../components/Avatar';
import { UpdatedInfo } from '../../components/common/PageHeader/UpdatedInfo';
import { DocumentEditorProvider } from './editor/DocumentEditorContext';
import { useDocumentReader } from './editor/useDocumentReader';
import DocumentReportLayout from './presentation/DocumentReportLayout';
import styles from './presentation/ReportPresentation.module.css';

const DocumentRenderer = ({
    document,
    actions,
}: {
    document: Document;
    actions?: ReactNode;
}) => {
    const { cells } = document.version.content;
    const { editor, headings } = useDocumentReader(document);
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
    const creatorName = document.createdBy
        ? `${document.createdBy.firstName} ${document.createdBy.lastName}`.trim() ||
          'Unknown user'
        : null;
    return (
        <DocumentReportLayout
            title={document.name}
            contentsLabel={null}
            headings={headings}
            variant="document"
            actions={actions}
            metadata={
                <Group gap="xs" wrap="nowrap">
                    {document.createdBy && (
                        <>
                            <Group
                                gap="xs"
                                wrap="nowrap"
                                role="group"
                                aria-label="Created by"
                            >
                                <LightdashUserAvatar
                                    userUuid={document.createdBy.userUuid}
                                    avatarUrl={document.createdBy.avatarUrl}
                                    avatarGradient={
                                        document.createdBy.avatarGradient
                                    }
                                    name={creatorName ?? undefined}
                                    size="sm"
                                    aria-hidden
                                />
                                <Text fz="xs" fw={500} c="dimmed">
                                    {creatorName}
                                </Text>
                            </Group>
                            <Text fz="xs" c="dimmed" aria-hidden>
                                ·
                            </Text>
                        </>
                    )}
                    <UpdatedInfo
                        updatedAt={document.updatedAt}
                        user={null}
                        partiallyBold={false}
                    />
                </Group>
            }
        >
            {cells.length === 0 ? (
                <Text c="dimmed">This document is empty.</Text>
            ) : (
                <DocumentEditorProvider value={target}>
                    <EditorContent
                        editor={editor}
                        className={styles.documentProse}
                    />
                </DocumentEditorProvider>
            )}
        </DocumentReportLayout>
    );
};
export default DocumentRenderer;
