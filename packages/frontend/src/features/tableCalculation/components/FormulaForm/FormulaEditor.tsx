import {
    getItemMap,
    isField,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { listFunctions } from '@lightdash/formula';
import { Box } from '@mantine-8/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useEditor, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
    generateFieldSuggestion,
    type FieldSuggestionItem,
} from '../../../../components/common/SuggestionList';
import styles from './FormulaEditor.module.css';
import {
    generateFunctionSuggestion,
    type FunctionSuggestionItem,
} from './generateFunctionSuggestion';
import { getInputMode } from './inputMode';

const MentionWithLabel = Mention.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            label: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-label'),
                renderHTML: (attributes: Record<string, string>) => {
                    if (!attributes.label) return {};
                    return { 'data-label': attributes.label };
                },
            },
        };
    },
});

function buildInitialContent(
    text: string,
    suggestions: FieldSuggestionItem[],
): JSONContent {
    if (!text || suggestions.length === 0) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        };
    }

    const sorted = [...suggestions].sort((a, b) => b.id.length - a.id.length);
    const pattern = new RegExp(
        `(${sorted.map((f) => f.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
        'g',
    );

    const parts = text.split(pattern);
    const fieldMap = new Map(sorted.map((f) => [f.id, f]));

    const inlineContent: JSONContent[] = parts
        .filter((part) => part.length > 0)
        .map((part) => {
            const field = fieldMap.get(part);
            if (field) {
                return {
                    type: 'mention',
                    attrs: { id: field.id, label: field.label },
                };
            }
            return { type: 'text', text: part };
        });

    return {
        type: 'doc',
        content: [{ type: 'paragraph', content: inlineContent }],
    };
}

type GhostState = {
    getPreview: () => string | null;
    getShowTab: () => boolean;
    getShowRetry: () => boolean;
    getShowLoading: () => boolean;
};

const ghostPluginKey = new PluginKey('formulaGhostPreview');

const buildGhostPlugin = (state: GhostState) =>
    new Plugin({
        key: ghostPluginKey,
        props: {
            decorations(editorState) {
                const preview = state.getPreview();
                const showTab = state.getShowTab();
                const showRetry = state.getShowRetry();
                const showLoading = state.getShowLoading();
                if (!preview && !showTab && !showRetry) {
                    return DecorationSet.empty;
                }

                // `content.size - 1` lands inside the closing paragraph token,
                // which for this single-paragraph editor is always a valid
                // inline position.
                const end = editorState.doc.content.size;
                const anchor = Math.max(0, end - 1);

                const container = document.createElement('span');
                container.className = 'formula-ghost-container';
                container.setAttribute('aria-hidden', 'true');

                if (preview) {
                    const ghost = document.createElement('span');
                    ghost.className = 'formula-preview-ghost';
                    ghost.textContent = ` → ${preview}`;
                    container.appendChild(ghost);
                }

                if (showTab || showRetry) {
                    const classes = ['formula-inline-chip'];
                    if (showRetry) classes.push('formula-inline-chip--retry');
                    // Shimmer the keycap while a preview is being generated in the background.
                    // Gated on !showRetry so error state stays visually still.
                    if (showLoading && !preview && !showRetry) {
                        classes.push('formula-inline-chip--loading');
                    }
                    const badge = document.createElement('kbd');
                    badge.className = classes.join(' ');
                    badge.textContent = showRetry ? '⇥ Retry' : '⇥ Tab';
                    container.appendChild(badge);
                }

                return DecorationSet.create(editorState.doc, [
                    Decoration.widget(anchor, container, { side: 1 }),
                ]);
            },
        },
    });

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    initialContent?: string;
    onTextChange?: (text: string) => void;
    onBlur?: () => void;
    editorRef?: React.MutableRefObject<Editor | null>;
    isFullScreen?: boolean;
    /** Ambient AI on. When off, Tab hint and prompt placeholder are suppressed. */
    aiEnabled?: boolean;
    /** Fired when Tab is pressed in prompt mode with non-empty content. */
    onTabInPromptMode?: (promptText: string) => void;
    /** Disables Tab trigger while AI is running. */
    isGenerating?: boolean;
    /** Swaps Tab chip to Retry styling. */
    hasAiError?: boolean;
    /** Inline ghost preview appended to the content (read-only hint). */
    previewSuffix?: string | null;
    /** Preview request in flight; shows a subtle loading indicator inline. */
    isPreviewing?: boolean;
};

const PLACEHOLDER_FORMULA =
    'Type @ for fields or # for functions. Example: =IF(@Revenue > 1000, "high", "low")';
const PLACEHOLDER_DUAL =
    'Describe the calculation, or =SUM(@Revenue) for a formula';

export const FormulaEditor: FC<Props> = ({
    explore,
    metricQuery,
    initialContent,
    onTextChange,
    onBlur,
    editorRef,
    isFullScreen,
    aiEnabled = false,
    onTabInPromptMode,
    isGenerating = false,
    hasAiError = false,
    previewSuffix = null,
    isPreviewing = false,
}) => {
    const [currentText, setCurrentText] = useState(initialContent ?? '');
    const mode = getInputMode(currentText);

    // Refs let handleKeyDown (configured once at editor mount) read live values.
    const localEditorRef = useRef<Editor | null>(null);
    const aiEnabledRef = useRef(aiEnabled);
    aiEnabledRef.current = aiEnabled;
    const isGeneratingRef = useRef(isGenerating);
    isGeneratingRef.current = isGenerating;
    const onTabInPromptModeRef = useRef(onTabInPromptMode);
    onTabInPromptModeRef.current = onTabInPromptMode;
    const previewSuffixRef = useRef<string | null>(previewSuffix);
    previewSuffixRef.current = previewSuffix;
    const isPreviewingRef = useRef(isPreviewing);
    isPreviewingRef.current = isPreviewing;
    const showTabHintRef = useRef(false);
    const showRetryHintRef = useRef(false);

    const fieldSuggestions: FieldSuggestionItem[] = useMemo(() => {
        if (!explore) return [];

        const itemsMap = getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
            metricQuery.customDimensions,
        );

        const usedFieldIds = new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...(metricQuery.tableCalculations ?? []).map((tc) => tc.name),
        ]);

        return Object.entries(itemsMap)
            .filter(([id]) => usedFieldIds.has(id))
            .map(([id, fieldItem]) => ({
                id,
                label: isField(fieldItem)
                    ? fieldItem.label
                    : 'displayName' in fieldItem
                      ? (fieldItem.displayName ?? fieldItem.name)
                      : fieldItem.name,
                item: fieldItem,
            }));
    }, [explore, metricQuery]);

    const functionSuggestions: FunctionSuggestionItem[] = useMemo(
        () =>
            listFunctions().map((fn) => ({
                id: fn.name,
                label: fn.name,
                description: fn.description,
                definition: fn,
            })),
        [],
    );

    const placeholder = aiEnabled ? PLACEHOLDER_DUAL : PLACEHOLDER_FORMULA;

    const editor = useEditor({
        editorProps: {
            attributes: {
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'off',
            },
            handleKeyDown: (_view, event) => {
                const text = localEditorRef.current?.getText() ?? '';
                const currentMode = getInputMode(text);
                const aiOn = aiEnabledRef.current;
                const loading = isGeneratingRef.current;

                if (
                    aiOn &&
                    !loading &&
                    event.key === 'Tab' &&
                    !event.shiftKey &&
                    currentMode === 'prompt' &&
                    text.trim().length > 0
                ) {
                    event.preventDefault();
                    onTabInPromptModeRef.current?.(text);
                    return true;
                }

                // Swallow Tab while loading so focus doesn't escape.
                if (aiOn && loading && event.key === 'Tab') {
                    event.preventDefault();
                    return true;
                }

                return false;
            },
        },
        extensions: [
            StarterKit.configure({
                heading: false,
                bulletList: false,
                orderedList: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
            }),
            MentionWithLabel.configure({
                suggestion: {
                    ...generateFieldSuggestion(fieldSuggestions),
                    allowedPrefixes: null,
                },
                renderText: ({ node }) =>
                    `${node.attrs.id ?? node.attrs.label}`,
                renderHTML: ({ node }) => [
                    'span',
                    { class: styles.mentionLabel },
                    `${node.attrs.label ?? node.attrs.id}`,
                ],
            }),
            Mention.extend({ name: 'functionMention' }).configure({
                suggestion: {
                    ...generateFunctionSuggestion(functionSuggestions),
                    pluginKey: new PluginKey('functionMention'),
                },
                renderText: ({ node }) => node.attrs.id ?? '',
                renderHTML: ({ node }) => ['span', {}, node.attrs.id ?? ''],
            }),
            Placeholder.configure({ placeholder }),
        ],
        content: initialContent
            ? buildInitialContent(initialContent, fieldSuggestions)
            : undefined,
        onUpdate: ({ editor: e }) => {
            const text = e.getText();
            setCurrentText(text);
            if (onTextChange) onTextChange(text);
        },
        onBlur: () => {
            onBlur?.();
        },
    });

    useEffect(() => {
        localEditorRef.current = editor;
        if (editorRef) {
            editorRef.current = editor;
        }
    }, [editor, editorRef]);

    useEffect(() => {
        if (!editor || initialContent === undefined) return;
        if (editor.getText() === initialContent) return;
        editor.commands.setContent(
            buildInitialContent(initialContent, fieldSuggestions),
        );
        setCurrentText(initialContent);
    }, [editor, initialContent, fieldSuggestions]);

    useEffect(() => {
        if (editor && fieldSuggestions.length > 0) {
            editor.extensionManager.extensions.forEach((ext) => {
                if (ext.name === 'mention') {
                    ext.options.suggestion =
                        generateFieldSuggestion(fieldSuggestions);
                }
            });
        }
    }, [editor, fieldSuggestions]);

    useEffect(() => {
        if (!editor) return;
        const ext = editor.extensionManager.extensions.find(
            (e) => e.name === 'placeholder',
        );
        if (ext) ext.options.placeholder = placeholder;
        editor.view.dispatch(editor.state.tr);
    }, [editor, placeholder]);

    const showRetryHint =
        aiEnabled && hasAiError && !isGenerating && mode === 'prompt';
    const showTabHint =
        aiEnabled && !hasAiError && !isGenerating && mode === 'prompt';

    showTabHintRef.current = showTabHint;
    showRetryHintRef.current = showRetryHint;

    // Register the ghost decoration plugin once the editor is ready, and
    // unregister it on cleanup. An empty transaction re-runs decorations when
    // any of the ghost state sources change so the ref values are picked up.
    useEffect(() => {
        if (!editor) return;
        const plugin = buildGhostPlugin({
            getPreview: () => previewSuffixRef.current,
            getShowTab: () => showTabHintRef.current,
            getShowRetry: () => showRetryHintRef.current,
            getShowLoading: () => isPreviewingRef.current,
        });
        editor.registerPlugin(plugin);
        return () => {
            editor.unregisterPlugin(ghostPluginKey);
        };
    }, [editor]);

    useEffect(() => {
        if (!editor) return;
        editor.view.dispatch(editor.state.tr);
    }, [editor, previewSuffix, showTabHint, showRetryHint, isPreviewing]);

    return (
        <Box className={styles.container}>
            <RichTextEditor
                editor={editor}
                classNames={{
                    root: styles.editorRoot,
                    content: styles.editorContent,
                }}
            >
                <Box className={styles.editorContentWrapper}>
                    <RichTextEditor.Content
                        className={styles.editorContentInner}
                        style={{
                            minHeight: isFullScreen ? '300px' : '120px',
                        }}
                    />
                </Box>
            </RichTextEditor>
        </Box>
    );
};
