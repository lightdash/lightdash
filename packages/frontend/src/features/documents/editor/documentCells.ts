import { type DocumentCell } from '@lightdash/common';
import { type Editor } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
    DOCUMENT_CHART_NODE,
    type DocumentChartAttributes,
} from './documentChartNode';

// tiptap-markdown exposes its serializer on storage without typing it.
declare module 'tiptap-markdown' {
    interface MarkdownStorage {
        serializer: { serialize(content: ProseMirrorNode | Fragment): string };
    }
}

const flushMarkdown = (
    editor: Editor,
    run: ProseMirrorNode[],
    cells: DocumentCell[],
) => {
    if (run.length === 0) {
        return;
    }
    const markdown = editor.storage.markdown.serializer
        .serialize(Fragment.from(run))
        .trim();
    if (markdown) {
        cells.push({ type: 'markdown', content: { markdown } });
    }
};

/** The saved-cell shape of the current document: chart nodes split the Markdown around them. */
export const getDocumentCells = (editor: Editor): DocumentCell[] => {
    const cells: DocumentCell[] = [];
    let run: ProseMirrorNode[] = [];
    editor.state.doc.forEach((node) => {
        if (node.type.name !== DOCUMENT_CHART_NODE) {
            run.push(node);
            return;
        }
        flushMarkdown(editor, run, cells);
        run = [];
        const { content } = node.attrs as DocumentChartAttributes;
        if (content) {
            cells.push({ type: 'chart', content });
        }
    });
    flushMarkdown(editor, run, cells);
    return cells;
};
