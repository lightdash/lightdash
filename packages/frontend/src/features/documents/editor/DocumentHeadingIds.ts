import { Extension } from '@tiptap/core';
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { type ReportHeading } from '../presentation/DocumentReportLayout';

type DocumentHeadingNode = ReportHeading & { position: number; size: number };

const getHeadingNodes = (doc: ProseMirrorNode): DocumentHeadingNode[] => {
    const headings: DocumentHeadingNode[] = [];
    doc.forEach((node, position) => {
        if (node.type.name !== 'heading' || node.attrs.level !== 1) {
            return;
        }
        const label = node.textContent.trim();
        if (label) {
            headings.push({
                id: `document-heading-${headings.length}`,
                label,
                position,
                size: node.nodeSize,
            });
        }
    });
    return headings;
};

/** Top-level H1s in document order; ids are positional so rail and page never drift. */
export const getDocumentHeadings = (doc: ProseMirrorNode): ReportHeading[] =>
    getHeadingNodes(doc).map(({ id, label }) => ({ id, label }));

export const areHeadingsEqual = (a: ReportHeading[], b: ReportHeading[]) =>
    a.length === b.length &&
    a.every(
        (heading, index) =>
            heading.id === b[index].id && heading.label === b[index].label,
    );

/** Stamps top-level H1s with the ids and markers the contents rail scroll-spies on. */
export const DocumentHeadingIds = Extension.create({
    name: 'documentHeadingIds',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('documentHeadingIds'),
                props: {
                    decorations: (state) =>
                        DecorationSet.create(
                            state.doc,
                            getHeadingNodes(state.doc).map((heading, index) =>
                                Decoration.node(
                                    heading.position,
                                    heading.position + heading.size,
                                    {
                                        id: heading.id,
                                        'data-report-heading': '',
                                        ...(index === 0
                                            ? { 'data-first-heading': 'true' }
                                            : {}),
                                    },
                                ),
                            ),
                        ),
                },
            }),
        ];
    },
});
