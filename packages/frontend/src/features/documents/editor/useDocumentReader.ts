import { type Document } from '@lightdash/common';
import { useEditor, useEditorState } from '@tiptap/react';
import { useMemo } from 'react';
import { type ReportHeading } from '../presentation/DocumentReportLayout';
import { buildDocumentContent } from './documentContent';
import { createDocumentEditorExtensions } from './documentEditorExtensions';
import { areHeadingsEqual, getDocumentHeadings } from './DocumentHeadingIds';

const NO_HEADINGS: ReportHeading[] = [];

/** A read-only editor over a saved version, recreated when the version changes. */
export const useDocumentReader = (document: Document) => {
    const { cells } = document.version.content;
    const extensions = useMemo(() => createDocumentEditorExtensions(), []);
    const editor = useEditor(
        {
            editable: false,
            extensions,
            content: '',
            onCreate: ({ editor: created }) => {
                created.commands.setContent(
                    buildDocumentContent(created, cells),
                    { emitUpdate: false },
                );
            },
        },
        [document.version.versionUuid],
    );
    const headings = useEditorState({
        editor,
        selector: ({ editor: current }) =>
            current ? getDocumentHeadings(current.state.doc) : NO_HEADINGS,
        equalityFn: (a, b) => b !== null && areHeadingsEqual(a, b),
    });
    return { editor, headings: headings ?? NO_HEADINGS };
};
