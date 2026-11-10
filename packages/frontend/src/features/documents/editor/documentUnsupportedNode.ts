import { type DocumentChartBlock } from '@lightdash/common';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import DocumentUnsupportedNodeView from './DocumentUnsupportedNodeView';

export const DOCUMENT_UNSUPPORTED_NODE = 'documentUnsupported';

export type DocumentUnsupportedBlock = Extract<
    DocumentChartBlock,
    { type: 'unsupportedChart' | 'unsupportedTag' }
>;

export type DocumentUnsupportedAttributes = {
    block: DocumentUnsupportedBlock | null;
};

/**
 * Content saved by a newer release: shown as a placeholder, movable and
 * removable, and written back unchanged. It is never created from pasted
 * HTML, since the server only accepts it unchanged from the saved version.
 */
export const DocumentUnsupportedNode = Node.create({
    name: DOCUMENT_UNSUPPORTED_NODE,
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
        return ['div', { 'data-document-unsupported': '' }];
    },

    addNodeView() {
        return ReactNodeViewRenderer(DocumentUnsupportedNodeView);
    },

    // Written back in getDocumentContent, not by the Markdown serializer.
    addStorage() {
        return { markdown: { serialize: () => {}, parse: {} } };
    },
});
