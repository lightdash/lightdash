import { ChartType, type DocumentCell } from '@lightdash/common';
import { Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
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

export type EditChartHandler = (
    position: number,
    content: DocumentChartContent,
) => void;

export type DocumentChartNodeOptions = {
    /** Opens the chart editor for the node at this document position. */
    onEditChart: EditChartHandler | null;
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

export const isEditableChart = (content: DocumentChartContent | null) =>
    content?.source === 'semantic' &&
    content.chart.chartConfig.type !== ChartType.DATA_APP_VIZ;

export const DocumentChartNode = Node.create<DocumentChartNodeOptions>({
    name: DOCUMENT_CHART_NODE,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addOptions() {
        return { onEditChart: null };
    },

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

    addKeyboardShortcuts() {
        return {
            Enter: () => {
                const { selection } = this.editor.state;
                if (
                    !this.options.onEditChart ||
                    !(selection instanceof NodeSelection) ||
                    selection.node.type.name !== this.name
                ) {
                    return false;
                }
                const { content } = selection.node
                    .attrs as DocumentChartAttributes;
                if (!content || !isEditableChart(content)) {
                    return false;
                }
                this.options.onEditChart(selection.from, content);
                return true;
            },
        };
    },

    // Charts have no Markdown form; the cell serializer handles them.
    addStorage() {
        return { markdown: { serialize: () => {}, parse: {} } };
    },
});
