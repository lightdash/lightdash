import { getDocumentChartTag, type DocumentContent } from '@lightdash/common';
import { type Editor } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
    DOCUMENT_CHART_NODE,
    type DocumentChartAttributes,
} from './documentChartNode';
import {
    DOCUMENT_UNSUPPORTED_NODE,
    type DocumentUnsupportedAttributes,
} from './documentUnsupportedNode';

// tiptap-markdown exposes its serializer on storage without typing it.
declare module 'tiptap-markdown' {
    interface MarkdownStorage {
        serializer: { serialize(content: ProseMirrorNode | Fragment): string };
    }
}

const serializeMarkdown = (editor: Editor, run: ProseMirrorNode[]) =>
    editor.storage.markdown.serializer.serialize(Fragment.from(run)).trim();

/**
 * The saved form of the current document: Markdown with a chart tag where
 * each chart node sits. New charts get temporary keys the server replaces.
 */
export const getDocumentContent = (editor: Editor): DocumentContent => {
    const parts: string[] = [];
    const charts: DocumentContent['charts'] = {};
    const unsupportedCharts: Record<string, unknown> = {};
    let run: ProseMirrorNode[] = [];
    let newCharts = 0;
    const flush = () => {
        const markdown = run.length > 0 ? serializeMarkdown(editor, run) : '';
        if (markdown) parts.push(markdown);
        run = [];
    };
    editor.state.doc.forEach((node) => {
        if (node.type.name === DOCUMENT_UNSUPPORTED_NODE) {
            flush();
            const { block } = node.attrs as DocumentUnsupportedAttributes;
            // Written back as read; a copy of a chart would repeat its id
            if (block?.type === 'unsupportedTag') {
                parts.push(block.line);
            } else if (block && !Object.hasOwn(unsupportedCharts, block.id)) {
                unsupportedCharts[block.id] = block.raw;
                parts.push(getDocumentChartTag(block.id));
            }
            return;
        }
        if (node.type.name !== DOCUMENT_CHART_NODE) {
            run.push(node);
            return;
        }
        flush();
        const { content, chartId } = node.attrs as DocumentChartAttributes;
        if (!content) return;
        // A duplicated node keeps its id; only the first keeps the identity
        let id = chartId;
        if (id === null || Object.hasOwn(charts, id)) {
            newCharts += 1;
            id = `new-${newCharts}`;
        }
        charts[id] = content;
        parts.push(getDocumentChartTag(id));
    });
    flush();
    return {
        markdown: parts.join('\n\n'),
        charts,
        ...(Object.keys(unsupportedCharts).length > 0
            ? { unsupportedCharts }
            : {}),
    };
};

/**
 * Charts only live at the top level, so a caret inside a list, table or quote
 * inserts after that top-level block instead.
 */
export const getTopLevelInsertPosition = (
    doc: ProseMirrorNode,
    position: number,
): number => {
    const resolved = doc.resolve(Math.min(position, doc.content.size));
    return resolved.depth > 1 ? resolved.after(1) : resolved.pos;
};
