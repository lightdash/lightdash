import { AI_THREAD_IMAGES_MAX_PER_PROMPT } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../../../api';
import { uploadCaptureImages } from './uploadCaptureImages';

const image = (index: number) =>
    new File(['x'], `capture-${index}.jpg`, { type: 'image/jpeg' });

describe('uploadCaptureImages', () => {
    it('uploads up to the per-message limit and returns the file ids', async () => {
        const api = vi.fn(async () => ({
            uuid: `file-${api.mock.calls.length}`,
        }));
        const ids = await uploadCaptureImages(
            api as unknown as LightdashApi,
            Array.from({ length: 7 }, (_, index) => image(index)),
        );
        expect(api).toHaveBeenCalledTimes(AI_THREAD_IMAGES_MAX_PER_PROMPT);
        expect(ids).toHaveLength(AI_THREAD_IMAGES_MAX_PER_PROMPT);
    });

    // The agent still gets the words when images cannot be uploaded.
    it('returns no ids when an upload fails', async () => {
        const api = vi.fn(async () => {
            throw new Error('Images are off');
        });
        expect(
            await uploadCaptureImages(api as unknown as LightdashApi, [
                image(1),
            ]),
        ).toEqual([]);
    });
});
