import { ActionIcon } from '@mantine-8/core';
import { IconSend } from '@tabler/icons-react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useRef, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useUploadAnnouncementImage } from '../../hooks/useAnnouncements';
import classes from './AnnouncementComposer.module.css';
import { createAnnouncementExtensions } from './announcementExtensions';
import { serializeAnnouncementMarkdown } from './serializeAnnouncementMarkdown';

type Props = {
    projectUuid: string;
    onPost: (markdown: string) => void;
};

const ALLOWED_IMAGE_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const AnnouncementComposer: FC<Props> = ({ projectUuid, onPost }) => {
    const { showToastError } = useToaster();
    const uploadImageMutation = useUploadAnnouncementImage(projectUuid);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const editor = useEditor({
        extensions: createAnnouncementExtensions(
            () => projectUuid,
            () => fileInputRef.current?.click(),
        ),
    });

    const insertImage = useCallback(
        (file: File) => {
            if (!editor) return;
            if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
                showToastError({
                    title: 'Unsupported image type',
                    subtitle: `Allowed: ${Array.from(ALLOWED_IMAGE_TYPES).join(
                        ', ',
                    )}`,
                });
                return;
            }
            if (file.size > MAX_IMAGE_BYTES) {
                showToastError({
                    title: 'Image too large',
                    subtitle: 'Maximum size is 5MB',
                });
                return;
            }
            uploadImageMutation.mutate(file, {
                onSuccess: ({ url }) => {
                    editor
                        .chain()
                        .focus()
                        .setImage({ src: url, alt: file.name })
                        .run();
                },
            });
        },
        [editor, uploadImageMutation, showToastError],
    );

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
        const file = Array.from(event.clipboardData.items)
            .find((item) => item.type.startsWith('image/'))
            ?.getAsFile();
        if (file) {
            event.preventDefault();
            insertImage(file);
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        const file = Array.from(event.dataTransfer.files).find((f) =>
            f.type.startsWith('image/'),
        );
        if (file) {
            event.preventDefault();
            insertImage(file);
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) insertImage(file);
        event.target.value = '';
    };

    const handlePost = () => {
        if (!editor) return;
        const markdown = serializeAnnouncementMarkdown(editor, projectUuid);
        if (!markdown) return;
        onPost(markdown);
        editor.commands.clearContent();
    };

    return (
        <div
            className={classes.composer}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                aria-label="Insert image"
                hidden
                onChange={handleFileSelect}
            />
            <EditorContent editor={editor} className={classes.editorContent} />
            <ActionIcon
                variant="subtle"
                size="lg"
                color="ldGray.6"
                aria-label="Post announcement"
                loading={uploadImageMutation.isLoading}
                onClick={handlePost}
            >
                <MantineIcon icon={IconSend} />
            </ActionIcon>
        </div>
    );
};
