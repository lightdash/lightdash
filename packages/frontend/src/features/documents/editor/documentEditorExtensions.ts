import Document from '@tiptap/extension-document';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { createMentionMarkdownExtension } from '../../../ee/features/homepageBuilder/blocks/markdownEditor/contentMentionMarkdown';
import { SlashCommand } from '../../../ee/features/homepageBuilder/blocks/markdownEditor/SlashCommandExtension';
import {
    DOCUMENT_CHART_NODE,
    DocumentChartNode,
    type EditChartHandler,
} from './documentChartNode';
import { DocumentHeadingIds } from './DocumentHeadingIds';
import {
    DOCUMENT_SAVED_CHART_NODE,
    DocumentSavedChartNode,
} from './documentSavedChartNode';
import { createDocumentSlashCommandItems } from './documentSlashCommandItems';
import { DocumentTable } from './documentTableMarkdown';
import {
    DOCUMENT_UNSUPPORTED_NODE,
    DocumentUnsupportedNode,
} from './documentUnsupportedNode';
import { EmptyLineCleanup } from './emptyLineCleanup';

export type DocumentEditorExtensionOptions = {
    projectUuid: string;
    /** Authoring-only extensions (placeholder, slash menu, chart callbacks) are added when set. */
    editing?: {
        onInsertChart: ((position: number) => void) | null;
        onEditChart: EditChartHandler | null;
    };
};

const DocumentWithCharts = Document.extend({
    content: `(block | ${DOCUMENT_CHART_NODE} | ${DOCUMENT_SAVED_CHART_NODE} | ${DOCUMENT_UNSUPPORTED_NODE})+`,
});

export const createDocumentEditorExtensions = ({
    projectUuid,
    editing,
}: DocumentEditorExtensionOptions): Extensions => [
    DocumentWithCharts,
    StarterKit.configure({
        document: false,
        dropcursor: { color: 'var(--mantine-color-text)', width: 2 },
        link: { openOnClick: !editing, autolink: false },
        // Reading never needs a caret landing spot after the last block
        trailingNode: editing ? undefined : false,
    }),
    TableKit.configure({ table: false }),
    DocumentTable.configure({ resizable: false }),
    Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
    }),
    createMentionMarkdownExtension(projectUuid),
    DocumentHeadingIds,
    DocumentChartNode.configure({
        onEditChart: editing?.onEditChart ?? null,
    }),
    DocumentSavedChartNode,
    DocumentUnsupportedNode,
    ...(editing
        ? [
              EmptyLineCleanup,
              Placeholder.configure({
                  placeholder: "Write something, or type '/' for blocks…",
              }),
              SlashCommand.configure({
                  items: createDocumentSlashCommandItems({
                      onInsertChart: editing.onInsertChart,
                  }),
              }),
          ]
        : []),
];
