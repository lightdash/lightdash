import { Box, Text } from '@mantine-8/core';
import { RichTextEditor } from '@mantine-8/tiptap';
import Placeholder from '@tiptap/extension-placeholder';
import {
    useEditor,
    type AnyExtension,
    type Editor,
    type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type ClipboardEvent as ReactClipboardEvent,
    type ReactNode,
} from 'react';
import classes from './PromptComposer.module.css';

export type PromptComposerHandle = {
    editor: Editor | null;
    getText: () => string;
    clear: () => void;
    focus: () => void;
    insertContent: (content: JSONContent[]) => void;
};

type PromptComposerVariant = 'card' | 'inline';

/** Editor height/typography preset. `lg` is the full-page composer, `md` the
 *  sidebar composer, `sm` the dense in-thread card. Ignored by `inline`. */
type PromptComposerSize = 'sm' | 'md' | 'lg';

/** Tints the whole composer to signal a distinct mode (e.g. deep research). */
type PromptComposerAccent = 'none' | 'indigo';

type Props = {
    variant?: PromptComposerVariant;
    size?: PromptComposerSize;
    accent?: PromptComposerAccent;
    placeholder?: string;
    defaultValue?: string;
    autoFocus?: boolean;
    /** Makes the editor read-only. */
    disabled?: boolean;
    /** Blocks Enter-to-submit while keeping the editor editable, so users can
     *  draft the next prompt while the previous one is still running. */
    submitDisabled?: boolean;
    /** Caller-specific TipTap extensions — mention/pill nodes, suggestions. */
    extensions?: AnyExtension[];
    /** Enter (without Shift). Receives the editor's plain-text serialization. */
    onSubmit?: (text: string) => void;
    onEmptyChange?: (isEmpty: boolean) => void;
    onValueChange?: (text: string) => void;
    onPaste?: (event: ReactClipboardEvent) => void;
    onMouseDown?: () => void;
    /** Fires once the TipTap instance exists, for callers that need to drive
     *  it imperatively from effects rather than through the ref handle. */
    onEditorReady?: (editor: Editor) => void;
    /** Return true to let another consumer own Enter — e.g. an open @-mention
     *  dropdown that selects on Enter rather than submitting. */
    shouldBlockSubmit?: (editor: Editor | null) => boolean;
    /** Mode indicator rendered above (card) or before (inline) the editor. */
    header?: ReactNode;
    /** Attached resources rendered between the editor and the toolbar. */
    attachments?: ReactNode;
    toolbarLeft?: ReactNode;
    toolbarRight?: ReactNode;
    className?: string;
};

const PromptComposer = forwardRef<PromptComposerHandle, Props>(
    function PromptComposer(
        {
            variant = 'card',
            size = 'lg',
            accent = 'none',
            placeholder = '',
            defaultValue,
            autoFocus = false,
            disabled = false,
            submitDisabled = false,
            extensions = [],
            onSubmit,
            onEmptyChange,
            onValueChange,
            onPaste,
            onMouseDown,
            onEditorReady,
            shouldBlockSubmit,
            header,
            attachments,
            toolbarLeft,
            toolbarRight,
            className,
        },
        ref,
    ) {
        // Handlers are wired into the editor once at mount; refs keep them
        // pointing at the latest closures.
        const onSubmitRef = useRef(onSubmit);
        onSubmitRef.current = onSubmit;
        const onPasteRef = useRef(onPaste);
        onPasteRef.current = onPaste;
        const onValueChangeRef = useRef(onValueChange);
        onValueChangeRef.current = onValueChange;
        const onEmptyChangeRef = useRef(onEmptyChange);
        onEmptyChangeRef.current = onEmptyChange;
        const submitDisabledRef = useRef(submitDisabled);
        submitDisabledRef.current = submitDisabled;
        const shouldBlockSubmitRef = useRef(shouldBlockSubmit);
        shouldBlockSubmitRef.current = shouldBlockSubmit;
        const editorRef = useRef<Editor | null>(null);

        const [isEmpty, setIsEmpty] = useState(!defaultValue);

        const editor = useEditor({
            extensions: [
                StarterKit.configure({
                    // Single-paragraph, textarea-like behaviour.
                    heading: false,
                    bulletList: false,
                    orderedList: false,
                    blockquote: false,
                    codeBlock: false,
                    horizontalRule: false,
                }),
                // Inline mode paints its own ellipsised placeholder overlay,
                // so the editor must not also emit one — a CSS-only override
                // is fragile here, an empty attr is not.
                Placeholder.configure({
                    placeholder: variant === 'inline' ? '' : placeholder,
                }),
                ...extensions,
            ],
            editable: !disabled,
            autofocus: autoFocus,
            content: defaultValue ?? '',
            onUpdate: ({ editor: ed }) => {
                setIsEmpty(ed.isEmpty);
                onEmptyChangeRef.current?.(ed.isEmpty);
                onValueChangeRef.current?.(ed.getText());
            },
            editorProps: {
                handleKeyDown: (_, event) => {
                    if (
                        event.key !== 'Enter' ||
                        event.shiftKey ||
                        event.isComposing
                    ) {
                        return false;
                    }
                    const ed = editorRef.current;
                    if (shouldBlockSubmitRef.current?.(ed)) return false;
                    const text = ed?.getText({ blockSeparator: '\n' }) ?? '';
                    if (!text.trim()) return true;
                    event.preventDefault();
                    // Swallow Enter while submission is gated so the draft
                    // doesn't collect stray newlines.
                    if (!submitDisabledRef.current) {
                        onSubmitRef.current?.(text);
                    }
                    return true;
                },
                handleDOMEvents: {
                    paste: (_view, event) => {
                        onPasteRef.current?.(
                            event as unknown as ReactClipboardEvent,
                        );
                        // Don't claim the event — TipTap still handles text.
                        return false;
                    },
                },
            },
        });
        editorRef.current = editor;

        useEffect(() => {
            editor?.setEditable(!disabled);
        }, [editor, disabled]);

        const onEditorReadyRef = useRef(onEditorReady);
        onEditorReadyRef.current = onEditorReady;
        useEffect(() => {
            if (editor) onEditorReadyRef.current?.(editor);
        }, [editor]);

        useImperativeHandle(
            ref,
            () => ({
                editor,
                getText: () => editor?.getText({ blockSeparator: '\n' }) ?? '',
                clear: () => {
                    editor?.commands.clearContent();
                    setIsEmpty(true);
                },
                focus: () => editor?.commands.focus('end'),
                insertContent: (content) => {
                    editor?.chain().focus().insertContent(content).run();
                },
            }),
            [editor],
        );

        const isInline = variant === 'inline';
        const editorSurface = (
            <RichTextEditor
                editor={editor}
                classNames={{
                    root: classes.editorRoot,
                    content: isInline
                        ? classes.inlineEditorContent
                        : classes.editorContent,
                }}
            >
                <RichTextEditor.Content />
            </RichTextEditor>
        );

        return (
            <Box
                className={`${classes.root} ${className ?? ''}`}
                data-variant={variant}
                data-size={size}
                data-accent={accent}
                onMouseDown={onMouseDown}
            >
                {header && <Box className={classes.header}>{header}</Box>}

                {isInline ? (
                    <Box className={classes.inlineEditorWrap}>
                        {editorSurface}
                        {isEmpty && placeholder && (
                            <Text
                                aria-hidden
                                className={classes.inlinePlaceholder}
                            >
                                {placeholder}
                            </Text>
                        )}
                    </Box>
                ) : (
                    editorSurface
                )}

                {attachments && (
                    <Box className={classes.attachments}>{attachments}</Box>
                )}

                {isInline
                    ? toolbarRight && (
                          <Box className={classes.inlineActions}>
                              {toolbarRight}
                          </Box>
                      )
                    : (toolbarLeft || toolbarRight) && (
                          <Box className={classes.toolbar}>
                              <Box className={classes.toolbarSection}>
                                  {toolbarLeft}
                              </Box>
                              <Box className={classes.toolbarSection}>
                                  {toolbarRight}
                              </Box>
                          </Box>
                      )}
            </Box>
        );
    },
);

export default PromptComposer;
