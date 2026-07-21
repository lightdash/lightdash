import { type ContentType } from '@lightdash/common';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState, type ChangeEvent, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import useToaster from '../../../../../hooks/toaster/useToaster';
import {
    createMentionMarkdownExtension,
    hydrateContentMentions,
    mentionUrl,
} from './contentMentionMarkdown';
import { SlashCommand } from './SlashCommandExtension';
import { createSlashCommandItems } from './slashCommandItems';
import classes from './TiptapMarkdownEditor.module.css';

// Read-mode image lightbox: dimmed blurred backdrop, image scaled to fit,
// alt text as caption. Esc or any click closes.
const ImageLightbox: FC<{ src: string; alt: string; onClose: () => void }> = ({
    src,
    alt,
    onClose,
}) => {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return createPortal(
        <div
            className={classes.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label={alt || 'Image preview'}
        >
            <button
                type="button"
                className={classes.lightboxClose}
                onClick={onClose}
                aria-label="Close image preview"
            />
            <img className={classes.lightboxImage} src={src} alt={alt} />
            {alt ? <div className={classes.lightboxCaption}>{alt}</div> : null}
        </div>,
        document.body,
    );
};

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
    /**
     * When set, enables `@`-mentions of charts/dashboards in this project,
     * serialized to markdown links and hydrated back into chips on load.
     */
    mentionProjectUuid?: string;
    /** Read-only render mode — no editing, no toolbar. Defaults to true. */
    editable?: boolean;
};

export const TiptapMarkdownEditor: FC<Props> = ({
    content,
    onChange,
    onImageUpload,
    mentionProjectUuid,
    editable = true,
}) => {
    const { showToastError } = useToaster();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [lightbox, setLightbox] = useState<{
        src: string;
        alt: string;
    } | null>(null);

    const extensions: Extensions = [
        StarterKit,
        Link.configure({ openOnClick: !editable, autolink: false }),
        Image,
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
        ...(mentionProjectUuid
            ? [createMentionMarkdownExtension(mentionProjectUuid)]
            : []),
    ];

    const editor = useEditor({
        editable,
        onCreate: mentionProjectUuid
            ? ({ editor: created }) => hydrateContentMentions(created)
            : undefined,
        extensions,
        content,
        onUpdate: ({ editor: updatedEditor }) => {
            const { markdown } = updatedEditor.storage as {
                markdown: MarkdownStorage;
            };
            onChange(markdown.getMarkdown());
        },
    });

    // Read mode: mention chips are React node views that swallow ProseMirror's
    // own click handling, so navigate from a DOM-level click via posAtDOM.
    const handleMentionClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (editable || !mentionProjectUuid || !editor) return;
        const chip = (event.target as HTMLElement).closest(
            '.node-contentMention',
        );
        if (!chip) return;
        const pos = editor.view.posAtDOM(chip, 0);
        if (pos < 0) return;
        const found: { contentType: ContentType; uuid: string }[] = [];
        editor.state.doc.nodesBetween(
            Math.max(0, pos - 1),
            Math.min(editor.state.doc.content.size, pos + 1),
            (node) => {
                if (node.type.name !== 'contentMention') return;
                const contentType = node.attrs
                    .contentType as ContentType | null;
                const uuid = node.attrs.uuid as string | null;
                if (contentType && uuid) found.push({ contentType, uuid });
            },
        );
        const [mention] = found;
        if (mention) {
            void navigate(
                mentionUrl(
                    mentionProjectUuid,
                    mention.contentType,
                    mention.uuid,
                ),
            );
        }
    };

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
            editor
                ?.chain()
                .focus()
                .setImage({ src: url, alt: file.name })
                .run();
        } catch (error) {
            showToastError({
                title: 'Failed to upload image',
                subtitle: error instanceof Error ? error.message : undefined,
            });
        }
    };

    return (
        <>
            <div
                role="presentation"
                onClick={(event) => {
                    if (!editable && event.target instanceof HTMLImageElement) {
                        setLightbox({
                            src: event.target.src,
                            alt: event.target.alt,
                        });
                        return;
                    }
                    handleMentionClick(event);
                }}
                data-readonly={!editable || undefined}
            >
                <EditorContent
                    editor={editor}
                    className={classes.editorContent}
                />
            </div>
            {lightbox && (
                <ImageLightbox
                    src={lightbox.src}
                    alt={lightbox.alt}
                    onClose={() => setLightbox(null)}
                />
            )}
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
