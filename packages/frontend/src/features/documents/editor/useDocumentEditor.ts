import { type Document } from '@lightdash/common';
import { useEditor, useEditorState, type Editor } from '@tiptap/react';
import { useMemo, useRef } from 'react';
import { hydrateContentMentions } from '../../../ee/features/homepageBuilder/blocks/markdownEditor/contentMentionMarkdown';
import { type ReportHeading } from '../presentation/DocumentReportLayout';
import { getDocumentCells } from './documentCells';
import { buildDocumentContent } from './documentContent';
import {
    createDocumentEditorExtensions,
    type DocumentEditorExtensionOptions,
} from './documentEditorExtensions';
import { areHeadingsEqual, getDocumentHeadings } from './DocumentHeadingIds';

const NO_HEADINGS: ReportHeading[] = [];

const useDocumentHeadings = (editor: Editor | null) => {
    const headings = useEditorState({
        editor,
        selector: ({ editor: current }) =>
            current ? getDocumentHeadings(current.state.doc) : NO_HEADINGS,
        equalityFn: (a, b) => b !== null && areHeadingsEqual(a, b),
    });
    return headings ?? NO_HEADINGS;
};

const loadDocument = (editor: Editor, document: Document) => {
    editor.commands.setContent(
        buildDocumentContent(editor, document.version.content.cells),
        { emitUpdate: false },
    );
    hydrateContentMentions(editor);
};

/** A read-only editor over a saved version, recreated when the version changes. */
export const useDocumentReader = (document: Document) => {
    const extensions = useMemo(
        () =>
            createDocumentEditorExtensions({
                projectUuid: document.projectUuid,
            }),
        [document.projectUuid],
    );
    const editor = useEditor(
        {
            editable: false,
            extensions,
            content: '',
            onCreate: ({ editor: created }) => loadDocument(created, document),
        },
        [document.version.versionUuid],
    );
    return { editor, headings: useDocumentHeadings(editor) };
};

type EditingCallbacks = NonNullable<DocumentEditorExtensionOptions['editing']>;

/** An editable editor seeded from a saved version; `dirty` compares the serialised cells. */
export const useDocumentEditor = (
    document: Document,
    callbacks: EditingCallbacks,
) => {
    // Extensions capture callbacks once; a ref keeps them current without recreating the editor.
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;
    const baseline = useRef<string>('');
    const canInsertChart = callbacks.onInsertChart !== null;
    const canEditChart = callbacks.onEditChart !== null;
    const extensions = useMemo(
        () =>
            createDocumentEditorExtensions({
                projectUuid: document.projectUuid,
                editing: {
                    onInsertChart: canInsertChart
                        ? (position) =>
                              callbacksRef.current.onInsertChart?.(position)
                        : null,
                    onEditChart: canEditChart
                        ? (position, content) =>
                              callbacksRef.current.onEditChart?.(
                                  position,
                                  content,
                              )
                        : null,
                },
            }),
        [document.projectUuid, canInsertChart, canEditChart],
    );
    const editor = useEditor(
        {
            editable: true,
            editorProps: {
                attributes: {
                    role: 'textbox',
                    'aria-multiline': 'true',
                    'aria-label': 'Document body',
                },
            },
            extensions,
            content: '',
            onCreate: ({ editor: created }) => {
                loadDocument(created, document);
                baseline.current = JSON.stringify(getDocumentCells(created));
            },
        },
        [document.version.versionUuid, extensions],
    );
    const serialised = useEditorState({
        editor,
        // A destroyed editor (StrictMode remount) has no extension storage
        selector: ({ editor: current }) =>
            current && !current.isDestroyed
                ? JSON.stringify(getDocumentCells(current))
                : '',
    });
    return {
        editor,
        headings: useDocumentHeadings(editor),
        dirty: serialised !== null && serialised !== baseline.current,
    };
};
