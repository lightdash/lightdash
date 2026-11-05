import { Box, Text } from '@mantine/core';
import { useDrag } from '@mantine/hooks';
import { RichTextEditor } from '@mantine/tiptap';
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
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from 'react';
import classes from './PromptComposer.module.css';

const RESIZE_KEYBOARD_STEP = 16;
// Fallback when computed styles are unavailable (e.g. jsdom).
const MIN_EDITOR_HEIGHT = 40;
// The editor may take at most half of the area it is docked in, so the
// conversation above it always keeps room.
const MAX_EDITOR_SHARE = 0.5;

const px = (value: string) => Number.parseFloat(value) || 0;

const findScrollParent = (element: HTMLElement): HTMLElement | null => {
    let node = element.parentElement;
    while (node) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === 'auto' || overflowY === 'scroll') return node;
        node = node.parentElement;
    }
    return null;
};

// The floor is one line of text without a scrollbar, which exceeds the
// stylesheet's min-height once the editor's own inner padding is counted.
const minEditorHeight = (content: HTMLElement) => {
    const contentStyle = getComputedStyle(content);
    const editor = content.querySelector<HTMLElement>('.ProseMirror');
    const editorStyle = editor ? getComputedStyle(editor) : null;
    const oneLine = editorStyle
        ? px(contentStyle.paddingTop) +
          px(contentStyle.paddingBottom) +
          px(editorStyle.paddingTop) +
          px(editorStyle.paddingBottom) +
          px(editorStyle.lineHeight)
        : 0;
    return Math.max(px(contentStyle.minHeight), oneLine) || MIN_EDITOR_HEIGHT;
};

const clampEditorHeight = (height: number, content: HTMLElement) => {
    const min = minEditorHeight(content);
    const dockHeight =
        findScrollParent(content)?.clientHeight || window.innerHeight;
    const max = Math.max(min, Math.round(dockHeight * MAX_EDITOR_SHARE));
    return Math.min(max, Math.max(min, Math.round(height)));
};

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

export type PromptComposerResizeHandle = 'top' | 'bottom';

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
    /** Card only: a drag handle on one edge that lets the editor grow away
     *  from the opposite edge. `top` suits a composer docked at the bottom of
     *  a thread, `bottom` a free-standing one. */
    resizeHandle?: PromptComposerResizeHandle;
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
            resizeHandle,
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
        const placeholderRef = useRef(placeholder);
        placeholderRef.current = placeholder;

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
                    link: false,
                    underline: false,
                    trailingNode: false,
                }),
                // Inline mode paints its own ellipsised placeholder overlay,
                // so the editor must not also emit one — a CSS-only override
                // is fragile here, an empty attr is not.
                Placeholder.configure({
                    placeholder: () =>
                        variant === 'inline' ? '' : placeholderRef.current,
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

        // Decorations only recompute on a transaction, so a new placeholder
        // needs an empty one to repaint without touching the draft.
        useEffect(() => {
            if (editor && !editor.isDestroyed) {
                editor.view.dispatch(editor.state.tr);
            }
        }, [editor, placeholder]);

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
        const contentRef = useRef<HTMLDivElement>(null);
        const [editorHeight, setEditorHeight] = useState<number | null>(null);
        const dragStartHeightRef = useRef<number | null>(null);

        // Dragging the handle away from the opposite edge grows the editor.
        const growSign = resizeHandle === 'top' ? -1 : 1;
        const { ref: resizeHandleRef } = useDrag(
            ({ first, movement: [, dy], event }) => {
                const content = contentRef.current;
                if (!content) return;
                if (first) {
                    dragStartHeightRef.current = content.clientHeight;
                    (
                        event.currentTarget as HTMLElement | null
                    )?.setPointerCapture(event.pointerId);
                    return;
                }
                const start = dragStartHeightRef.current;
                if (start === null) return;
                setEditorHeight(
                    clampEditorHeight(start + growSign * dy, content),
                );
            },
        );

        const handleResizeKeyDown = (
            event: ReactKeyboardEvent<HTMLDivElement>,
        ) => {
            const content = contentRef.current;
            if (!content) return;
            const movement =
                event.key === 'ArrowUp'
                    ? -1
                    : event.key === 'ArrowDown'
                      ? 1
                      : 0;
            if (movement === 0) return;
            event.preventDefault();
            const step = RESIZE_KEYBOARD_STEP * (event.shiftKey ? 4 : 1);
            setEditorHeight(
                clampEditorHeight(
                    content.clientHeight + growSign * movement * step,
                    content,
                ),
            );
        };

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
                <RichTextEditor.Content ref={contentRef} />
            </RichTextEditor>
        );

        return (
            <Box
                className={`${classes.root} ${className ?? ''}`}
                data-variant={variant}
                data-size={size}
                data-accent={accent}
                data-disabled={disabled || undefined}
                data-resized={editorHeight !== null || undefined}
                __vars={{
                    '--composer-editor-height':
                        editorHeight === null ? undefined : `${editorHeight}px`,
                }}
                onMouseDown={onMouseDown}
            >
                {!isInline && resizeHandle && (
                    <Box
                        ref={resizeHandleRef}
                        role="separator"
                        aria-label="Resize composer"
                        aria-orientation="horizontal"
                        tabIndex={0}
                        className={classes.resizeHandle}
                        data-placement={resizeHandle}
                        onMouseDown={(event) => event.stopPropagation()}
                        onDoubleClick={() => setEditorHeight(null)}
                        onKeyDown={handleResizeKeyDown}
                    />
                )}
                {header && <Box className={classes.header}>{header}</Box>}

                {isInline && toolbarLeft && (
                    <Box className={classes.inlineActions}>{toolbarLeft}</Box>
                )}

                {isInline ? (
                    <Box className={classes.inlineMain}>
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
                        {attachments && (
                            <Box className={classes.attachments}>
                                {attachments}
                            </Box>
                        )}
                    </Box>
                ) : (
                    editorSurface
                )}

                {!isInline && attachments && (
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
