import {
    threadFileAttachmentInput,
    threadFileAttachmentSnapshot,
} from './threadFileAttachmentContext';
import { type ThreadImageAttachment } from './useThreadFileAttachment';

const image: ThreadImageAttachment = {
    type: 'thread_image',
    fileUuid: 'image-uuid',
    fileName: 'revenue.png',
    sizeBytes: 1234,
    mediaType: 'image/png',
    width: 1600,
    height: 900,
    expiresAt: '2100-01-01T00:00:00.000Z',
    previewUrl: 'blob:private-local-preview',
};

test('submission is identity-only and optimistic snapshots whitelist metadata, never preview URLs', () => {
    const input = threadFileAttachmentInput(image);
    const snapshot = threadFileAttachmentSnapshot(image);
    expect(input).toEqual({ type: 'thread_image', fileUuid: 'image-uuid' });
    expect(snapshot).toEqual({
        type: 'thread_image',
        fileUuid: 'image-uuid',
        fileName: 'revenue.png',
        sizeBytes: 1234,
        mediaType: 'image/png',
        width: 1600,
        height: 900,
        expiresAt: image.expiresAt,
    });
    expect(snapshot).not.toHaveProperty('previewUrl');
    expect(JSON.stringify({ input, snapshot })).not.toContain('blob:');
});

test('text attachment serialization is unchanged', () => {
    const file = {
        type: 'thread_file',
        fileUuid: 'text-uuid',
        fileName: 'notes.txt',
        sizeBytes: 15,
    } as const;
    expect(threadFileAttachmentInput(file)).toEqual({
        type: 'thread_file',
        fileUuid: 'text-uuid',
    });
    expect(threadFileAttachmentSnapshot(file)).toEqual(file);
});
