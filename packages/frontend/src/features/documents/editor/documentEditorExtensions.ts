import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { createMentionMarkdownExtension } from '../../../ee/features/homepageBuilder/blocks/markdownEditor/contentMentionMarkdown';
import { SlashCommand } from '../../../ee/features/homepageBuilder/blocks/markdownEditor/SlashCommandExtension';
import { DocumentChartNode, type EditChartHandler } from './documentChartNode';
import { DocumentHeadingIds } from './DocumentHeadingIds';
import { createDocumentSlashCommandItems } from './documentSlashCommandItems';

export type DocumentEditorExtensionOptions = {
    projectUuid: string;
    /** Authoring-only extensions (placeholder, slash menu, chart callbacks) are added when set. */
    editing?: {
        onInsertChart: ((position: number) => void) | null;
        onEditChart: EditChartHandler | null;
    };
};

export const createDocumentEditorExtensions = ({
    projectUuid,
    editing,
}: DocumentEditorExtensionOptions): Extensions => [
    StarterKit.configure({
        link: { openOnClick: !editing, autolink: false },
        // Reading never needs a caret landing spot after the last block
        trailingNode: editing ? undefined : false,
    }),
    TableKit.configure({ table: { resizable: false } }),
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
    ...(editing
        ? [
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
