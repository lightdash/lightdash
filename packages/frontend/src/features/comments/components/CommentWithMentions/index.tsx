import { useMantineTheme } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, type FC } from 'react';
import { type SuggestionsItem } from '../../types';
import { generateSuggestionWrapper } from './generateSuggestionWrapper';

type Props = {
    suggestions?: SuggestionsItem[];
    content?: string;
    onUpdate?: (editor: Editor | null) => void;
    shouldClearEditor?: boolean;
    setShouldClearEditor?: (shouldClearEditor: boolean) => void;
};

export const CommentWithMentions: FC<Props> = ({
    suggestions,
    onUpdate,
    content,
    shouldClearEditor,
    setShouldClearEditor,
}) => {
    const theme = useMantineTheme();

    const editor = useEditor({
        extensions: [
            StarterKit,
            Mention.configure({
                HTMLAttributes: {
                    style: `color: ${theme.colors.blue['6']}; font-weight: 500;`,
                },
                suggestion: suggestions
                    ? generateSuggestionWrapper(suggestions)
                    : undefined,
            }),
            Placeholder.configure({
                placeholder: 'Add comment (type @ to tag someone)',
            }),
        ],
        content,
        onUpdate: () => {
            if (onUpdate) onUpdate(editor);
        },
    });

    useEffect(() => {
        if (shouldClearEditor) {
            editor?.commands.clearContent();
            setShouldClearEditor?.(false);
        }
    }, [editor?.commands, setShouldClearEditor, shouldClearEditor]);

    return (
        <RichTextEditor
            editor={editor}
            styles={{
                content: {
                    maxHeight: 100,
                    overflowY: 'auto',
                    '& > .tiptap': {
                        padding: 6,
                    },
                },
            }}
        >
            <RichTextEditor.Content fz="xs" />
        </RichTextEditor>
    );
};
