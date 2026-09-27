import { type DocumentCell } from '@lightdash/common';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import DocumentChartNodeView from './DocumentChartNodeView';

export const DOCUMENT_CHART_NODE = 'documentChart';

export type DocumentChartContent = Extract<
    DocumentCell,
    { type: 'chart' }
>['content'];

/** `sourceIndex` is the cell index in the saved version; null for unsaved charts. */
export type DocumentChartAttributes = {
    content: DocumentChartContent | null;
    sourceIndex: number | null;
};

const CONTENT_ATTRIBUTE = 'data-document-chart';

const parseContentAttribute = (
    value: string | null,
): DocumentChartContent | null => {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value) as DocumentChartContent;
    } catch {
        return null;
    }
};

export const DocumentChartNode = Node.create({
    name: DOCUMENT_CHART_NODE,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
        return {
            content: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    parseContentAttribute(
                        element.getAttribute(CONTENT_ATTRIBUTE),
                    ),
                renderHTML: () => ({}),
            },
            sourceIndex: {
                default: null,
                parseHTML: () => null,
                renderHTML: () => ({}),
            },
        };
    },

    parseHTML() {
        return [{ tag: `div[${CONTENT_ATTRIBUTE}]` }];
    },

    renderHTML({ node }) {
        return [
            'div',
            { [CONTENT_ATTRIBUTE]: JSON.stringify(node.attrs.content) },
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(DocumentChartNodeView);
    },

    // Charts have no Markdown form; the cell serializer handles them.
    addStorage() {
        return { markdown: { serialize: () => {}, parse: {} } };
    },
});
