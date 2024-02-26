import { useMantineTheme } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { JSONContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FC, useEffect } from 'react';
import { SuggestionsItem } from '../../types';
import { generateSuggestionWrapper } from './generateSuggestionWrapper';

type Props = {
    readonly: boolean;
    suggestions?: SuggestionsItem[];
    setCommentText?: (text: string) => void;
    setCommentHtml?: (html: string) => void;
    content?: string;
    shouldClearEditor?: boolean;
    setShouldClearEditor?: (shouldClearEditor: boolean) => void;
    setMentions?: (mentions: string[]) => void;
};

const parseMentions = (data: JSONContent): string[] => {
    const mentions = (data.content || []).flatMap(parseMentions);
    if (data.type === 'mention' && data.attrs?.id) {
        mentions.push(data.attrs.id);
    }

    const uniqueMentions = [...new Set(mentions)];

    return uniqueMentions;
};

export const CommentWithMentions: FC<Props> = ({
    readonly,
    suggestions,
    setMentions,
    setCommentText,
    setCommentHtml,
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
        onUpdate(e) {
            setCommentText?.(e.editor.getText());
            setCommentHtml?.(e.editor.getHTML());
            setMentions?.(parseMentions(e.editor.getJSON()));
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
