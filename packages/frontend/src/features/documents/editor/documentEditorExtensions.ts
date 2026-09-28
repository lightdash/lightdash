import { TableKit } from '@tiptap/extension-table';
import { type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { DocumentChartNode } from './documentChartNode';
import { DocumentHeadingIds } from './DocumentHeadingIds';

export const createDocumentEditorExtensions = (): Extensions => [
    StarterKit.configure({
        link: { openOnClick: true, autolink: false },
        // Reading never needs a caret landing spot after the last block
        trailingNode: false,
    }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
    }),
    DocumentHeadingIds,
    DocumentChartNode,
];
