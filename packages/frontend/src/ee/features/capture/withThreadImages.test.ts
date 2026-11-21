import { type AiPromptContextInput } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../../../api';
import { withThreadImages } from './withThreadImages';

const mocks = vi.hoisted(() => ({ uploadCaptureImages: vi.fn() }));

vi.mock('../dashboardCapture/uploadCaptureImages', () => ({
    uploadCaptureImages: mocks.uploadCaptureImages,
}));

const api = vi.fn() as unknown as LightdashApi;
const image = new File(['x'], 'capture-0.jpg', { type: 'image/jpeg' });
const context: AiPromptContextInput = [
    { type: 'dashboard', dashboardUuid: 'dash-1' },
];
const message = (images: File[]) => ({
    buildPrompt: (hasImages: boolean) =>
        hasImages ? 'with images' : 'text only',
    images,
    context,
});

describe('withThreadImages', () => {
    beforeEach(() => {
        mocks.uploadCaptureImages.mockReset();
        mocks.uploadCaptureImages.mockResolvedValue(['file-1']);
    });

    it('uploads the images and adds them to the context', async () => {
        const sent = await withThreadImages(api, true, message([image]));

        expect(mocks.uploadCaptureImages).toHaveBeenCalledWith(api, [image]);
        expect(sent).toEqual({
            imagesDropped: false,
            prompt: 'with images',
            context: [...context, { type: 'thread_image', fileUuid: 'file-1' }],
        });
    });

    it('sends text only without ai-thread-images, and uploads nothing', async () => {
        const sent = await withThreadImages(api, false, message([image]));

        expect(mocks.uploadCaptureImages).not.toHaveBeenCalled();
        expect(sent).toEqual({
            prompt: 'text only',
            context,
            imagesDropped: false,
        });
    });

    it('sends text only when there are no images', async () => {
        const sent = await withThreadImages(api, true, message([]));

        expect(mocks.uploadCaptureImages).not.toHaveBeenCalled();
        expect(sent).toEqual({
            prompt: 'text only',
            context,
            imagesDropped: false,
        });
    });

    it('sends text only when the upload fails', async () => {
        mocks.uploadCaptureImages.mockResolvedValue([]);

        const sent = await withThreadImages(api, true, message([image]));

        expect(sent).toEqual({
            prompt: 'text only',
            context,
            imagesDropped: true,
        });
    });
});
