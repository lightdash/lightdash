import {
    getItemMap,
    isField,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { listFunctions } from '@lightdash/formula';
import { Box, Text } from '@mantine-8/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { PluginKey } from '@tiptap/pm/state';
import { useEditor, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, type FC } from 'react';
import {
    generateFieldSuggestion,
    type FieldSuggestionItem,
} from '../../../../components/common/SuggestionList';
import styles from './FormulaEditor.module.css';
import {
    generateFunctionSuggestion,
    type FunctionSuggestionItem,
} from './generateFunctionSuggestion';

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

/**
 * Convert plain formula text into TipTap JSON content,
 * replacing known field IDs with mention nodes.
 */
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

    // Sort field IDs by length descending to match longest first
    const sorted = [...suggestions].sort((a, b) => b.id.length - a.id.length);

    // Build a regex that matches any field ID as a whole word
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

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    initialContent?: string;
    onTextChange?: (text: string) => void;
    onBlur?: () => void;
    parseError?: string | null;
    editorRef?: React.MutableRefObject<Editor | null>;
    isFullScreen?: boolean;
};

export const FormulaEditor: FC<Props> = ({
    explore,
    metricQuery,
    initialContent,
    onTextChange,
    onBlur,
    parseError,
    editorRef,
    isFullScreen,
}) => {
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

    const editor = useEditor({
        editorProps: {
            attributes: {
                spellcheck: 'false',
                autocomplete: 'off',
                autocapitalize: 'off',
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
            Placeholder.configure({
                placeholder:
                    'Use @ to reference fields, # for functions. e.g. IF(@Revenue > 1000, "high", "low")',
            }),
        ],
        content: initialContent
            ? buildInitialContent(initialContent, fieldSuggestions)
            : undefined,
        onUpdate: ({ editor: e }) => {
            if (onTextChange) {
                onTextChange(e.getText());
            }
        },
        onBlur: () => {
            onBlur?.();
        },
    });

    // Expose editor ref for parent to call getText()
    useEffect(() => {
        if (editorRef) {
            editorRef.current = editor;
        }
    }, [editor, editorRef]);

    // Update field suggestions when fields change
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

    return (
        <Box className={styles.container}>
            <RichTextEditor
                editor={editor}
                classNames={{
                    root: styles.editorRoot,
                    content: styles.editorContent,
                }}
            >
                <Box className={styles.editorWithPrefix}>
                    <span className={styles.equalsPrefix}>=</span>
                    <RichTextEditor.Content
                        className={styles.editorContentInner}
                        style={{
                            minHeight: isFullScreen ? '300px' : '120px',
                        }}
                    />
                </Box>
            </RichTextEditor>
            {parseError && (
                <Text className={styles.errorText}>{parseError}</Text>
            )}
        </Box>
    );
};
