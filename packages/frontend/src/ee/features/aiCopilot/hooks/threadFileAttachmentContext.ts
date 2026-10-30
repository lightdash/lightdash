import {
    assertUnreachable,
    type AiPromptContextItem,
    type AiPromptContextItemInput,
} from '@lightdash/common';
import { type ThreadFileAttachment } from './useThreadFileAttachment';

export const threadFileAttachmentInput = (
    attachment: ThreadFileAttachment,
): AiPromptContextItemInput => {
    switch (attachment.type) {
        case 'thread_file':
        case 'thread_image':
            return { type: attachment.type, fileUuid: attachment.fileUuid };
        default:
            return assertUnreachable(attachment, 'Unknown thread attachment');
    }
};

/** Whitelist persisted fields: never leak a browser preview URL into optimistic thread state. */
export const threadFileAttachmentSnapshot = (
    attachment: ThreadFileAttachment,
): AiPromptContextItem => {
    const shared = {
        fileUuid: attachment.fileUuid,
        fileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
    };
    switch (attachment.type) {
        case 'thread_file':
            return { type: 'thread_file', ...shared };
        case 'thread_image':
            return {
                type: 'thread_image',
                ...shared,
                mediaType: attachment.mediaType,
                width: attachment.width,
                height: attachment.height,
                expiresAt: attachment.expiresAt,
            };
        default:
            return assertUnreachable(attachment, 'Unknown thread attachment');
    }
};
