/**
 * AppPromptEditor — TipTap-based replacement for the data-app prompt
 * textarea. Element references from the iframe inspector are inserted as
 * mention nodes that render as inline pills (visually clean) but serialize
 * back to the bracketed wire format on submit so Claude receives the same
 * `[h1 "FORMULA 1" @src/App.jsx:14]: …` text as before.
 *
 * Modeled on `AiPromptEditor.tsx` from the AI table calculation feature —
 * same Mention.extend() pattern with split renderText/renderHTML.
 */

import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import {
    EditorContent,
    useEditor,
    type Editor,
    type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    type ClipboardEvent as ReactClipboardEvent,
} from 'react';
import classes from './AppPromptEditor.module.css';

export type ElementRef = {
    /** Rendered HTML tag (e.g. `h1`, `div`, `button`). */
    tag: string;
    /** Visible text content of the clicked element, possibly truncated. */
    text: string;
    /** Build-time source location `path:line`. Empty when unavailable. */
    loc: string;
};

export type AppPromptEditorHandle = {
    insertElementRef: (ref: ElementRef) => void;
    clear: () => void;
    focus: () => void;
    getText: () => string;
};

type Props = {
    placeholder?: string;
    autoFocus?: boolean;
    disabled?: boolean;
    /** Called after every content change with whether the editor is empty —
     *  the parent uses this to enable/disable the submit button. */
    onEmptyChange?: (isEmpty: boolean) => void;
    /** Submit triggered by Enter (without Shift). The text is the wire-
     *  format string that mention nodes serialize to. */
    onSubmit?: (text: string) => void;
    /** Forwarded paste events — used by the parent to detect image paste. */
    onPaste?: (e: ReactClipboardEvent) => void;
};

/** Wire-format string a mention node serializes to. Mirrors the bracket
 *  format the iframe inspector and skill.md already use. */
function refToWireString({ tag, text, loc }: ElementRef): string {
    const head = text ? `${tag} "${text}"` : tag;
    return loc ? `[${head} @${loc}]` : `[${head}]`;
}

function pillInner(tag: string, text: string): string {
    return text ? `<${tag}> ${text}` : `<${tag}>`;
}

const ElementMention = Mention.extend({
    name: 'elementRef',
    // Pills behave as a single character — backspace deletes the whole pill.
    atom: true,
    addAttributes() {
        return {
            tag: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-tag') ?? '',
                renderHTML: (attrs) =>
                    attrs.tag ? { 'data-tag': attrs.tag } : {},
            },
            text: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-text') ?? '',
                renderHTML: (attrs) =>
                    attrs.text ? { 'data-text': attrs.text } : {},
            },
            loc: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-loc') ?? '',
                renderHTML: (attrs) =>
                    attrs.loc ? { 'data-loc': attrs.loc } : {},
            },
        };
    },
    // The base Mention extension's Backspace handler replaces the pill
    // with its suggestion char (`@`) — useful for re-triggering an
    // autocomplete, but we don't have one. Override to fully delete the
    // pill in one keystroke.
    addKeyboardShortcuts() {
        return {
            Backspace: () =>
                this.editor.commands.command(({ tr, state }) => {
                    const { selection } = state;
                    const { empty, anchor } = selection;
                    if (!empty || anchor <= 0) return false;
                    let deleted = false;
                    state.doc.nodesBetween(
                        Math.max(0, anchor - 1),
                        anchor,
                        (node, pos) => {
                            if (node.type.name === this.name) {
                                tr.delete(pos, pos + node.nodeSize);
                                deleted = true;
                                return false;
                            }
                        },
                    );
                    return deleted;
                }),
        };
    },
    // Explicit NodeView so the contenteditable surface gets the pill DOM
    // we actually want. The CSS-module class wasn't reliably landing through
    // renderHTML — building the element ourselves removes the indirection.
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('span');
            dom.className = classes.elementPill;
            dom.contentEditable = 'false';
            dom.textContent = pillInner(
                (node.attrs.tag as string) || '',
                (node.attrs.text as string) || '',
            );
            if (node.attrs.tag) {
                dom.setAttribute('data-tag', node.attrs.tag as string);
            }
            if (node.attrs.text) {
                dom.setAttribute('data-text', node.attrs.text as string);
            }
            if (node.attrs.loc) {
                dom.setAttribute('data-loc', node.attrs.loc as string);
                dom.setAttribute('title', `Source: ${node.attrs.loc}`);
            }
            return { dom };
        };
    },
}).configure({
    // What `editor.getText()` returns for this node — the wire format Claude
    // sees in the iteration prompt.
    renderText: ({ node }) =>
        refToWireString({
            tag: node.attrs.tag ?? '',
            text: node.attrs.text ?? '',
            loc: node.attrs.loc ?? '',
        }),
    // Used for getHTML()/copy/paste — match the NodeView output so a copy
    // out of the editor produces the same span structure.
    renderHTML: ({ node }) => [
        'span',
        { class: classes.elementPill, contenteditable: 'false' },
        pillInner(
            (node.attrs.tag as string) || '',
            (node.attrs.text as string) || '',
        ),
    ],
});

const AppPromptEditor = forwardRef<AppPromptEditorHandle, Props>(
    function AppPromptEditor(
        { placeholder, autoFocus, disabled, onEmptyChange, onSubmit, onPaste },
        ref,
    ) {
        // Refs so the editor's stable handlers (configured once at editor
        // mount) always reach the latest callback closures.
        const onSubmitRef = useRef(onSubmit);
        onSubmitRef.current = onSubmit;
        const onPasteRef = useRef(onPaste);
        onPasteRef.current = onPaste;
        const editorRef = useRef<Editor | null>(null);

        const editor = useEditor({
            extensions: [
                StarterKit.configure({
                    // Single-paragraph behaviour like a textarea — disable
                    // every block-level node we don't need.
                    heading: false,
                    bulletList: false,
                    orderedList: false,
                    blockquote: false,
                    codeBlock: false,
                    horizontalRule: false,
                    code: false,
                }),
                ElementMention,
                Placeholder.configure({ placeholder: placeholder ?? '' }),
            ],
            editable: !disabled,
            autofocus: autoFocus ?? false,
            onUpdate: ({ editor: e }) => {
                onEmptyChange?.(e.isEmpty);
            },
            editorProps: {
                handleKeyDown: (_, event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        const text = editorRef.current?.getText() ?? '';
                        const submit = onSubmitRef.current;
                        if (text.trim() && submit) {
                            event.preventDefault();
                            submit(text);
                            return true;
                        }
                    }
                    return false;
                },
                handleDOMEvents: {
                    paste(_view, event) {
                        onPasteRef.current?.(
                            event as unknown as ReactClipboardEvent,
                        );
                        // Don't claim the event — TipTap should still handle
                        // text paste normally.
                        return false;
                    },
                },
            },
        });

        editorRef.current = editor;

        useEffect(() => {
            editor?.setEditable(!disabled);
        }, [editor, disabled]);

        useImperativeHandle(
            ref,
            () => ({
                insertElementRef: (elementRef) => {
                    if (!editor) return;
                    // Each clicked element starts on its own line so multiple
                    // refs stack into a list — same UX as the textarea
                    // implementation. Skip the leading break when the
                    // cursor is at the start of the document or right after
                    // a line break.
                    const { from } = editor.state.selection;
                    const before = editor.state.doc.textBetween(
                        0,
                        from,
                        '\n',
                        '\n',
                    );
                    const needsBreak =
                        before.length > 0 && !before.endsWith('\n');
                    const inserts: JSONContent[] = [];
                    if (needsBreak) inserts.push({ type: 'hardBreak' });
                    inserts.push({
                        type: 'elementRef',
                        attrs: {
                            tag: elementRef.tag,
                            text: elementRef.text,
                            loc: elementRef.loc,
                        },
                    });
                    // Single space after the pill so typed text doesn't slam
                    // against it. The pill itself is the visual delimiter
                    // between "what" and "what to do" — no colon needed.
                    inserts.push({ type: 'text', text: ' ' });
                    editor.chain().focus().insertContent(inserts).run();
                },
                clear: () => {
                    editor?.commands.clearContent();
                },
                focus: () => {
                    editor?.commands.focus('end');
                },
                getText: () => editor?.getText({ blockSeparator: '\n' }) ?? '',
            }),
            [editor],
        );

        return (
            <EditorContent editor={editor} className={classes.editorContent} />
        );
    },
);

export default AppPromptEditor;
