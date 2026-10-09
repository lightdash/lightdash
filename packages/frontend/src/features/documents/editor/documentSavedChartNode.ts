import { type DocumentChartBlock } from '@lightdash/common';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import DocumentSavedChartNodeView from './DocumentSavedChartNodeView';

export const DOCUMENT_SAVED_CHART_NODE = 'documentSavedChart';

export type DocumentSavedChartLinkBlock = Extract<
    DocumentChartBlock,
    { type: 'savedChart' }
>;

export type DocumentSavedChartAttributes = {
    block: DocumentSavedChartLinkBlock | null;
};

/** A link to a saved chart: movable and removable, written back as its tag. */
export const DocumentSavedChartNode = Node.create({
    name: DOCUMENT_SAVED_CHART_NODE,
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
        return {
            block: { default: null, rendered: false },
        };
    },

    parseHTML() {
        return [];
    },

    renderHTML() {
        return ['div', { 'data-document-saved-chart': '' }];
    },

    addNodeView() {
        return ReactNodeViewRenderer(DocumentSavedChartNodeView);
    },

    // Written back in getDocumentContent, not by the Markdown serializer.
    addStorage() {
        return { markdown: { serialize: () => {}, parse: {} } };
    },
});
