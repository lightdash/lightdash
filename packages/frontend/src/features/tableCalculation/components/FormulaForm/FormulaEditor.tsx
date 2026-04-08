import {
    getItemMap,
    isField,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, type FC } from 'react';
import { type FieldSuggestionItem } from '../../../../ee/features/ambientAi/components/tableCalculation/components/AiPromptInput/FieldSuggestionList';
import { generateFieldSuggestion } from '../../../../ee/features/ambientAi/components/tableCalculation/components/AiPromptInput/generateFieldSuggestion';
import styles from './FormulaEditor.module.css';

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

type Props = {
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    initialContent?: string;
    onTextChange?: (text: string) => void;
    editorRef?: React.MutableRefObject<Editor | null>;
    isFullScreen?: boolean;
};

export const FormulaEditor: FC<Props> = ({
    explore,
    metricQuery,
    initialContent,
    onTextChange,
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

    const editor = useEditor({
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
                suggestion: generateFieldSuggestion(fieldSuggestions),
                renderText: ({ node }) =>
                    `${node.attrs.id ?? node.attrs.label}`,
                renderHTML: ({ node }) => [
                    'span',
                    { class: styles.mentionLabel },
                    `${node.attrs.label ?? node.attrs.id}`,
                ],
            }),
            Placeholder.configure({
                placeholder:
                    'Type a formula (use @ to reference fields)... e.g. =IF(@Revenue > 1000, "high", "low")',
            }),
        ],
        content: initialContent ? `<p>${initialContent}</p>` : undefined,
        onUpdate: ({ editor: e }) => {
            if (onTextChange) {
                onTextChange(e.getText());
            }
        },
    });

    // Expose editor ref for parent to call getText()
    useEffect(() => {
        if (editorRef) {
            editorRef.current = editor;
        }
    }, [editor, editorRef]);

    // Update suggestions when fields change
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
                <RichTextEditor.Content
                    style={{
                        minHeight: isFullScreen ? '300px' : '120px',
                    }}
                />
            </RichTextEditor>
        </Box>
    );
};
