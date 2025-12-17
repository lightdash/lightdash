import {
    getItemMap,
    isField,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, type FC } from 'react';
import styles from './AiPromptEditor.module.css';
import { type FieldSuggestionItem } from './FieldSuggestionList';
import { generateFieldSuggestion } from './generateFieldSuggestion';

const MentionWithLabel = Mention.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            label: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-label'),
                renderHTML: (attributes) => {
                    if (!attributes.label) return {};
                    return { 'data-label': attributes.label };
                },
            },
        };
    },
});

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    onUpdate?: (editor: Editor | null) => void;
    onSubmit?: (text: string) => void;
    shouldClear?: boolean;
    onCleared?: () => void;
    disabled?: boolean;
};

export const AiPromptEditor: FC<Props> = ({
    explore,
    metricQuery,
    onUpdate,
    onSubmit,
    shouldClear,
    onCleared,
    disabled,
}) => {
    // Build field suggestions from itemsMap
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
                    ? fieldItem.displayName ?? fieldItem.name
                    : fieldItem.name,
                item: fieldItem,
            }));
    }, [explore, metricQuery]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Disable block-level elements we don't need
                heading: false,
                bulletList: false,
                orderedList: false,
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
            }),
            MentionWithLabel.configure({
                suggestion: generateFieldSuggestion(fieldSuggestions),
                // renderText controls what getText() returns - use field ID for backend
                renderText: ({ node }) =>
                    `@${node.attrs.id ?? node.attrs.label}`,
                // renderHTML controls what's displayed in the editor - use label for UX
                renderHTML: ({ node }) => [
                    'span',
                    { class: styles.mentionLabel },
                    `@${node.attrs.label ?? node.attrs.id}`,
                ],
            }),
            Placeholder.configure({
                placeholder:
                    'Describe your calculation (type @ to reference fields)...',
            }),
        ],
        editable: !disabled,
        onUpdate: () => {
            if (onUpdate) onUpdate(editor);
        },
        editorProps: {
            handleKeyDown: (_, event) => {
                // Submit on Enter (without shift)
                if (event.key === 'Enter' && !event.shiftKey) {
                    const text = editor?.getText() ?? '';
                    if (text.trim() && onSubmit) {
                        event.preventDefault();
                        onSubmit(text);
                        return true;
                    }
                }
                return false;
            },
        },
    });

    // Clear editor when shouldClear changes to true
    useEffect(() => {
        if (shouldClear && editor) {
            editor.commands.clearContent();
            onCleared?.();
        }
    }, [shouldClear, editor, onCleared]);

    // Update suggestions when fields change
    useEffect(() => {
        if (editor && fieldSuggestions.length > 0) {
            // Update the mention extension's suggestion config
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
                autoFocus
            >
                <RichTextEditor.Content />
            </RichTextEditor>
        </Box>
    );
};
