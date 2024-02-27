import { useMantineTheme } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { Editor, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FC, useEffect } from 'react';
import { SuggestionsItem } from '../../types';
import { generateSuggestionWrapper } from './generateSuggestionWrapper';

type Props = {
    readonly: boolean;
    suggestions?: SuggestionsItem[];
    content?: string;
    onUpdate?: (editor: Editor | null) => void;
    shouldClearEditor?: boolean;
    setShouldClearEditor?: (shouldClearEditor: boolean) => void;
};

export const CommentWithMentions: FC<Props> = ({
    readonly,
    suggestions,
    onUpdate,
    content,
    shouldClearEditor,
    setShouldClearEditor,
}) => {
    const theme = useMantineTheme();

    const editor = useEditor({
        editable: !readonly,
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
                placeholder: 'Add comment (type @ to mention someone)',
            }),
        ],
        content,
        onUpdate: () => {
            onUpdate(editor);
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
                root: {
                    border: readonly ? 'none' : 'default',
                },
                content: {
                    '& > .tiptap': {
                        padding: readonly ? 0 : '4',
                    },
                },
            }}
        >
            <RichTextEditor.Content fz="xs" />
        </RichTextEditor>
    );
};
