import { type DocumentCell } from '@lightdash/common';
import { generateJSON, type Editor, type JSONContent } from '@tiptap/core';
import { DOCUMENT_CHART_NODE } from './documentChartNode';

// tiptap-markdown exposes its markdown-it parser on storage without typing it.
declare module 'tiptap-markdown' {
    interface MarkdownStorage {
        parser: { parse(content: string): string };
    }
}

const UNSUPPORTED_CELL_TEXT = 'This content type is not supported yet.';

const cellToContent = (
    editor: Editor,
    cell: DocumentCell,
    index: number,
): JSONContent[] => {
    switch (cell.type) {
        case 'markdown': {
            const html = editor.storage.markdown.parser.parse(
                cell.content.markdown,
            );
            // The unresolved option list; the manager's flattened list would
            // register StarterKit's children twice.
            return generateJSON(html, editor.options.extensions).content ?? [];
        }
        case 'chart':
            return [
                {
                    type: DOCUMENT_CHART_NODE,
                    attrs: { content: cell.content, sourceIndex: index },
                },
            ];
        default:
            // Older or newer servers may send cell types this build does not know.
            return [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: UNSUPPORTED_CELL_TEXT }],
                },
            ];
    }
};

/** One Tiptap document for a saved version: chart cells become chart nodes in place. */
export const buildDocumentContent = (
    editor: Editor,
    cells: DocumentCell[],
): JSONContent => ({
    type: 'doc',
    content: cells.flatMap((cell, index) => cellToContent(editor, cell, index)),
});
