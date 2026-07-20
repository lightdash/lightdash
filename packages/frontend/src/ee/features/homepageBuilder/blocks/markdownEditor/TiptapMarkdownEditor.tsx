import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useRef, type ChangeEvent, type FC } from 'react';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { createSlashCommandItems } from './slashCommandItems';
import { SlashCommand } from './SlashCommandExtension';
import classes from './TiptapMarkdownEditor.module.css';

const ACCEPTED_IMAGE_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type Props = {
    content: string;
    onChange: (markdown: string) => void;
    onImageUpload?: (file: File) => Promise<string>;
};

export const TiptapMarkdownEditor: FC<Props> = ({
    content,
    onChange,
    onImageUpload,
}) => {
    const { showToastError } = useToaster();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const extensions: Extensions = [
        StarterKit,
        Markdown.configure({
            html: false,
            transformPastedText: true,
            transformCopiedText: true,
        }),
        Placeholder.configure({
            placeholder: "Write something, or type '/' for commands…",
        }),
        onImageUpload
            ? SlashCommand.configure({
                  items: createSlashCommandItems({
                      onInsertImage: () => fileInputRef.current?.click(),
                  }),
              })
            : SlashCommand,
        ...(onImageUpload ? [Image] : []),
    ];

    const editor = useEditor({
        extensions,
        content,
        onUpdate: ({ editor: updatedEditor }) => {
            const { markdown } = updatedEditor.storage as {
                markdown: MarkdownStorage;
            };
            onChange(markdown.getMarkdown());
        },
    });

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !onImageUpload) return;

        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
            showToastError({
                title: 'Unsupported image type',
                subtitle: 'Please upload a PNG, JPEG, GIF, or WEBP image.',
            });
            return;
        }

        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            showToastError({
                title: 'Image too large',
                subtitle: 'Images must be 5MB or smaller.',
            });
            return;
        }

        try {
            const url = await onImageUpload(file);
            editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
        } catch (error) {
            showToastError({
                title: 'Failed to upload image',
                subtitle: error instanceof Error ? error.message : undefined,
            });
        }
    };

    return (
        <>
            <EditorContent
                editor={editor}
                className={classes.editorContent}
            />
            {onImageUpload && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(',')}
                    aria-label="Insert image"
                    hidden
                    onChange={handleFileChange}
                />
            )}
        </>
    );
};
