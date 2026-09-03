import { useMantineTheme } from '@mantine/core';
import { RichTextEditor } from '@mantine/tiptap';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, type FC } from 'react';
import { type SuggestionsItem } from '../../types';
import styles from './CommentWithMentions.module.css';
import { generateAsyncSuggestionWrapper } from './generateSuggestionWrapper';

type Props = {
    fetchSuggestions: (query: string) => Promise<SuggestionsItem[]>;
    content?: string;
    onUpdate?: (editor: Editor | null) => void;
    shouldClearEditor?: boolean;
    setShouldClearEditor?: (shouldClearEditor: boolean) => void;
};

export const CommentWithMentions: FC<Props> = ({
    fetchSuggestions,
    onUpdate,
    content,
    shouldClearEditor,
    setShouldClearEditor,
}) => {
    const theme = useMantineTheme();

    const fetchSuggestionsRef = useRef(fetchSuggestions);
    useEffect(() => {
        fetchSuggestionsRef.current = fetchSuggestions;
    }, [fetchSuggestions]);

    const onUpdateRef = useRef(onUpdate);
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                link: false,
                underline: false,
                trailingNode: false,
            }),
            Mention.configure({
                HTMLAttributes: {
                    style: `color: ${theme.colors.blue['6']}; font-weight: 500;`,
                },
                suggestion: generateAsyncSuggestionWrapper((query) =>
                    fetchSuggestionsRef.current(query),
                ),
            }),
            Placeholder.configure({
                placeholder: 'Add comment (type @ to tag someone)',
            }),
        ],
        content,
        onUpdate: ({ editor: currentEditor }) => {
            onUpdateRef.current?.(currentEditor as Editor);
        },
    });

    useEffect(() => {
        if (shouldClearEditor) {
            editor?.commands.clearContent();
            setShouldClearEditor?.(false);
        }
    }, [editor?.commands, setShouldClearEditor, shouldClearEditor]);

    return (
        <RichTextEditor editor={editor} className={styles.editor}>
            <RichTextEditor.Content fz="xs" />
        </RichTextEditor>
    );
};
