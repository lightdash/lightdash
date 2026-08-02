import { type ContentType } from '@lightdash/common';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FC,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react';
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

const SCROLL_LOCK_CLASS = 'tiptap-lightbox-scroll-lock';

// Read-mode image lightbox: dimmed blurred backdrop, image scaled to fit,
// alt text as caption. Esc or any click closes.
const ImageLightbox: FC<{ src: string; alt: string; onClose: () => void }> = ({
    src,
    alt,
    onClose,
}) => {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        closeRef.current?.focus();
        document.body.classList.add(SCROLL_LOCK_CLASS);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.classList.remove(SCROLL_LOCK_CLASS);
        };
    }, [onClose]);

    return createPortal(
        <div
            className={classes.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label={alt || 'Image preview'}
        >
            <button
                ref={closeRef}
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
    const lightboxTriggerRef = useRef<HTMLElement | null>(null);
    const [lightbox, setLightbox] = useState<{
        src: string;
        alt: string;
    } | null>(null);

    // Read mode skips the authoring-only extensions (placeholder, slash menu):
    // every feed item mounts one of these editors.
    const extensions: Extensions = [
        StarterKit,
        Link.configure({ openOnClick: !editable, autolink: false }),
        Image,
        Markdown.configure({
            html: false,
            transformPastedText: true,
            transformCopiedText: true,
        }),
        ...(editable
            ? [
                  Placeholder.configure({
                      placeholder: "Write something, or type '/' for commands…",
                  }),
                  onImageUpload
                      ? SlashCommand.configure({
                            items: createSlashCommandItems({
                                onInsertImage: () =>
                                    fileInputRef.current?.click(),
                            }),
                        })
                      : SlashCommand,
              ]
            : []),
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

    // Read mode: chips and images are rendered by ProseMirror, so make them
    // focusable/announceable imperatively once they are in the DOM.
    useEffect(() => {
        if (editable || !editor) return undefined;
        const root = editor.view.dom;
        const applyA11yAttributes = () => {
            if (mentionProjectUuid) {
                root.querySelectorAll('.node-contentMention').forEach(
                    (chip) => {
                        chip.setAttribute('tabindex', '0');
                        chip.setAttribute('role', 'link');
                        chip.setAttribute(
                            'aria-label',
                            `Open ${chip.textContent ?? ''}`.trim(),
                        );
                    },
                );
            }
            root.querySelectorAll('img').forEach((image) => {
                image.setAttribute('tabindex', '0');
                image.setAttribute('role', 'button');
                image.setAttribute(
                    'aria-label',
                    `Preview image ${image.getAttribute('alt') ?? ''}`.trim(),
                );
            });
        };
        applyA11yAttributes();
        const observer = new MutationObserver(applyA11yAttributes);
        observer.observe(root, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [editable, editor, mentionProjectUuid, content]);

    const openLightbox = (image: HTMLImageElement) => {
        lightboxTriggerRef.current = image;
        setLightbox({ src: image.src, alt: image.alt });
    };

    const closeLightbox = () => {
        setLightbox(null);
        lightboxTriggerRef.current?.focus();
        lightboxTriggerRef.current = null;
    };

    // Mention chips are React node views that swallow ProseMirror's own click
    // handling, so navigate from a DOM-level event via posAtDOM.
    const openMention = (chip: Element): boolean => {
        if (!mentionProjectUuid || !editor) return false;
        const pos = editor.view.posAtDOM(chip, 0);
        if (pos < 0) return false;
        const node =
            editor.state.doc.nodeAt(pos) ??
            (pos > 0 ? editor.state.doc.nodeAt(pos - 1) : null);
        if (!node || node.type.name !== 'contentMention') return false;
        const contentType = node.attrs.contentType as ContentType | null;
        const uuid = node.attrs.uuid as string | null;
        if (!contentType || !uuid) return false;
        void navigate(mentionUrl(mentionProjectUuid, contentType, uuid));
        return true;
    };

    const activateTarget = (target: EventTarget | null): boolean => {
        if (editable || !(target instanceof HTMLElement)) return false;
        if (target instanceof HTMLImageElement) {
            openLightbox(target);
            return true;
        }
        const chip = target.closest('.node-contentMention');
        return chip ? openMention(chip) : false;
    };

    const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        activateTarget(event.target);
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (activateTarget(event.target)) event.preventDefault();
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
        } catch {
            // The upload mutation already surfaces a toast.
        }
    };

    return (
        <>
            <div
                role="presentation"
                onClick={handleClick}
                onKeyDown={handleKeyDown}
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
                    onClose={closeLightbox}
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
