import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { type FC } from 'react';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import { SlashCommand } from './SlashCommandExtension';
import classes from './TiptapMarkdownEditor.module.css';

type Props = {
    content: string;
    onChange: (markdown: string) => void;
};

export const TiptapMarkdownEditor: FC<Props> = ({ content, onChange }) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Markdown.configure({
                html: false,
                transformPastedText: true,
                transformCopiedText: true,
            }),
            Placeholder.configure({
                placeholder: "Write something, or type '/' for commands…",
            }),
            SlashCommand,
        ],
        content,
        onUpdate: ({ editor: updatedEditor }) => {
            const { markdown } = updatedEditor.storage as {
                markdown: MarkdownStorage;
            };
            onChange(markdown.getMarkdown());
        },
    });

    return <EditorContent editor={editor} className={classes.editorContent} />;
};
