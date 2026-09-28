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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Pasted HTML can carry any attribute value, so check the fields rendering
 * reads; the server validates the full chart when the Document is saved.
 */
const isDocumentChartContent = (
    value: unknown,
): value is DocumentChartContent => {
    if (
        !isRecord(value) ||
        (value.source !== 'semantic' && value.source !== 'merge') ||
        !isRecord(value.chart)
    ) {
        return false;
    }
    const { name, tableName, metricQuery, chartConfig } = value.chart;
    return (
        typeof name === 'string' &&
        typeof tableName === 'string' &&
        isRecord(metricQuery) &&
        typeof metricQuery.exploreName === 'string' &&
        isRecord(chartConfig) &&
        typeof chartConfig.type === 'string' &&
        (value.source === 'semantic' || isRecord(value.chart.merge))
    );
};

const parseContentAttribute = (
    value: string | null,
): DocumentChartContent | null => {
    if (!value) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return isDocumentChartContent(parsed) ? parsed : null;
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
