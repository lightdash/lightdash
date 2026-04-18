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
import { ReactNodeViewRenderer, useEditor, type Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, type FC } from 'react';
import {
    generateFieldSuggestion,
    type FieldSuggestionItem,
} from '../../../../components/common/SuggestionList';
import styles from './FormulaEditor.module.css';
import { FunctionMentionView } from './FunctionMentionView';
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
 * replacing known field IDs and function names with mention nodes.
 */
function buildInitialContent(
    text: string,
    suggestions: FieldSuggestionItem[],
    functions: FunctionSuggestionItem[],
    functionTooltipMap: Map<string, string>,
): JSONContent {
    if (!text) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph', content: [] }],
        };
    }

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const fieldMap = new Map(suggestions.map((f) => [f.id, f]));
    const sortedFieldIds = [...suggestions]
        .sort((a, b) => b.id.length - a.id.length)
        .map((f) => f.id);

    const functionMap = new Map(functions.map((f) => [f.id, f]));
    const sortedFunctionNames = [...functions]
        .sort((a, b) => b.id.length - a.id.length)
        .map((f) => f.id);

    const fieldPattern = sortedFieldIds.length
        ? `(?<field>${sortedFieldIds.map(escapeRegex).join('|')})`
        : '';
    // Match function names only when followed by `(` so plain words like "SUM"
    // in a field name don't get wrapped as a function mention.
    const functionPattern = sortedFunctionNames.length
        ? `(?<func>\\b(?:${sortedFunctionNames.map(escapeRegex).join('|')})\\b)(?=\\s*\\()`
        : '';

    const patternStr = [fieldPattern, functionPattern]
        .filter(Boolean)
        .join('|');

    if (!patternStr) {
        return {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        };
    }

    const pattern = new RegExp(patternStr, 'g');
    const inlineContent: JSONContent[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(text);

    while (match !== null) {
        const { index } = match;
        const groups = match.groups as
            | { field?: string; func?: string }
            | undefined;

        if (index > lastIndex) {
            inlineContent.push({
                type: 'text',
                text: text.slice(lastIndex, index),
            });
        }

        if (groups?.field && fieldMap.has(groups.field)) {
            const field = fieldMap.get(groups.field)!;
            inlineContent.push({
                type: 'mention',
                attrs: { id: field.id, label: field.label },
            });
        } else if (groups?.func && functionMap.has(groups.func)) {
            const fn = functionMap.get(groups.func)!;
            inlineContent.push({
                type: 'functionMention',
                attrs: {
                    id: fn.id,
                    label: fn.label,
                    tooltip: functionTooltipMap.get(fn.id) ?? null,
                },
            });
        } else {
            inlineContent.push({ type: 'text', text: match[0] });
        }

        lastIndex = index + match[0].length;
        match = pattern.exec(text);
    }

    if (lastIndex < text.length) {
        inlineContent.push({ type: 'text', text: text.slice(lastIndex) });
    }

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

    const functionExampleMap = useMemo(
        () =>
            new Map(
                functionSuggestions.map((fn) => [
                    fn.id,
                    `${fn.description}\ne.g. =${fn.definition.example}`,
                ]),
            ),
        [functionSuggestions],
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
            Mention.extend({
                name: 'functionMention',
                addAttributes() {
                    return {
                        ...this.parent?.(),
                        tooltip: {
                            default: null,
                            parseHTML: (element: HTMLElement) =>
                                element.getAttribute('data-tooltip'),
                            renderHTML: (
                                attributes: Record<string, string>,
                            ) => {
                                if (!attributes.tooltip) return {};
                                return { 'data-tooltip': attributes.tooltip };
                            },
                        },
                    };
                },
                addNodeView() {
                    return ReactNodeViewRenderer(FunctionMentionView);
                },
            }).configure({
                suggestion: {
                    ...generateFunctionSuggestion(
                        functionSuggestions,
                        functionExampleMap,
                    ),
                    pluginKey: new PluginKey('functionMention'),
                },
                renderText: ({ node }) => node.attrs.id ?? '',
            }),
            Placeholder.configure({
                placeholder:
                    'Use @ to reference fields, # for functions. e.g. IF(@Revenue > 1000, "high", "low")',
            }),
        ],
        content: initialContent
            ? buildInitialContent(
                  initialContent,
                  fieldSuggestions,
                  functionSuggestions,
                  functionExampleMap,
              )
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
