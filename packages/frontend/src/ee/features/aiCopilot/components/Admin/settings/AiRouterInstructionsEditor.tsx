import { Box } from '@mantine/core';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { generateSuggestionWrapper } from '../../../../../../features/comments/components/CommentWithMentions/generateSuggestionWrapper';
import { type SuggestionsItem } from '../../../../../../features/comments/types';
import { instructionTextToHtml } from '../../../utils/aiRouterInstructions';
import styles from './AiRouterInstructionsEditor.module.css';

const RouterMention = Mention.extend({
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-id'),
                renderHTML: (attributes) =>
                    attributes.id ? { 'data-id': attributes.id } : {},
            },
            label: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-label'),
                renderHTML: (attributes) =>
                    attributes.label ? { 'data-label': attributes.label } : {},
            },
        };
    },
});

type Props = {
    suggestions: SuggestionsItem[];
    initialInstruction: string;
    disabled?: boolean;
    onChange: (instruction: string) => void;
};

export const AiRouterInstructionsEditor: FC<Props> = ({
    suggestions,
    initialInstruction,
    disabled = false,
    onChange,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                blockquote: false,
                codeBlock: false,
                horizontalRule: false,
                link: false,
                underline: false,
                trailingNode: false,
            }),
            Placeholder.configure({
                placeholder: t('settings.routing.placeholder'),
            }),
            RouterMention.configure({
                suggestion: generateSuggestionWrapper(suggestions),
                renderText: ({ node }) =>
                    typeof node.attrs.label === 'string' &&
                    typeof node.attrs.id === 'string'
                        ? `@[${node.attrs.label}](${node.attrs.id})`
                        : '',
                renderHTML: ({ node }) => [
                    'span',
                    {
                        class: styles.mention,
                        'data-type': 'mention',
                        'data-id': node.attrs.id,
                        'data-label': node.attrs.label,
                    },
                    `@${
                        typeof node.attrs.label === 'string'
                            ? node.attrs.label
                            : ''
                    }`,
                ],
            }),
        ],
        editable: !disabled,
        content: instructionTextToHtml(initialInstruction),
        editorProps: {
            attributes: {
                'aria-label': t('settings.routing.editorAria'),
                'aria-multiline': 'true',
                role: 'textbox',
            },
        },
        onUpdate: ({ editor: ed }) => onChange(ed.getText()),
    });

    const focusEditor = useCallback(() => editor?.commands.focus(), [editor]);

    return (
        <Box className={styles.editor} onClick={focusEditor}>
            <EditorContent editor={editor} />
        </Box>
    );
};
