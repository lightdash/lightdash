import { useMantineTheme } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { Content, Editor, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FC } from 'react';
import { SuggestionsItem } from '../../types';
import { generateSuggestionWrapper } from './generateSuggestionWrapper';

export const useTipTapEditorWithMentions = ({
    readonly,
    content,
    suggestions,
    setCommentText,
}: {
    readonly: boolean;
    content: Content;
    suggestions?: SuggestionsItem[];
    setCommentText?: (text: string) => void;
}): Editor | null => {
    const theme = useMantineTheme();

    const enableMentions = !readonly && suggestions && suggestions.length > 0;

    const editor = useEditor({
        editable: !readonly,
        extensions: [
            StarterKit,
            ...(enableMentions
                ? [
                      Mention.configure({
                          HTMLAttributes: {
                              style: `color: ${theme.colors.blue['6']}; font-weight: 500;`,
                          },
                          suggestion: generateSuggestionWrapper(suggestions),
                      }),
                  ]
                : []),
            Placeholder.configure({
                placeholder: 'Add comment (type @ to mention someone)',
            }),
        ],
        onUpdate: () => {
            if (readonly) return;
            setCommentText?.(editor?.getHTML() || '');
        },
        content,
    });

    return editor;
};

type Props = {
    editor: Editor;
    readonly?: boolean;
};

export const CommentWithMentions: FC<Props> = ({ editor, readonly }) => {
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
