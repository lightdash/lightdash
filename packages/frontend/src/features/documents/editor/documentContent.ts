import {
    getDocumentChartBlocks,
    type DocumentChartBlock,
    type DocumentContent,
} from '@lightdash/common';
import { generateJSON, type Editor, type JSONContent } from '@tiptap/core';
import {
    DOCUMENT_CHART_NODE,
    type DocumentChartAttributes,
} from './documentChartNode';
import {
    DOCUMENT_UNSUPPORTED_NODE,
    type DocumentUnsupportedAttributes,
} from './documentUnsupportedNode';

// tiptap-markdown exposes its markdown-it parser on storage without typing it.
declare module 'tiptap-markdown' {
    interface MarkdownStorage {
        parser: { parse(content: string): string };
    }
}

const blockToContent = (
    editor: Editor,
    block: DocumentChartBlock,
): JSONContent[] => {
    if (block.type === 'markdown') {
        const html = editor.storage.markdown.parser.parse(block.markdown);
        // The unresolved option list; the manager's flattened list would
        // register StarterKit's children twice.
        return generateJSON(html, editor.options.extensions).content ?? [];
    }
    if (block.type === 'chart') {
        const attrs: DocumentChartAttributes = {
            content: block.chart,
            chartId: block.id,
            isSaved: true,
        };
        return [{ type: DOCUMENT_CHART_NODE, attrs }];
    }
    const attrs: DocumentUnsupportedAttributes = { block };
    return [{ type: DOCUMENT_UNSUPPORTED_NODE, attrs }];
};

/** One Tiptap document for a saved version: chart tags become chart nodes in place. */
export const buildDocumentContent = (
    editor: Editor,
    content: DocumentContent,
): JSONContent => ({
    type: 'doc',
    content: getDocumentChartBlocks(content).flatMap((block) =>
        blockToContent(editor, block),
    ),
});
