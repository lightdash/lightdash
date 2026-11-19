import { describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../../../api';
import { captureTranscriber } from './transcribeCapture';

const apiReturning = (results: unknown) =>
    vi.fn(async () => results) as unknown as LightdashApi;

describe('captureTranscriber', () => {
    it('is null when voice is not available on the instance', () => {
        expect(
            captureTranscriber(apiReturning(null), 'project-1', false),
        ).toBeNull();
    });

    it('is null when availability is not known', () => {
        expect(
            captureTranscriber(apiReturning(null), 'project-1', undefined),
        ).toBeNull();
    });

    it('posts the audio for the project when voice is available', async () => {
        const words = [{ startMs: 0, endMs: 200, text: 'hello' }];
        const lightdashApi = apiReturning({ words });

        const transcribe = captureTranscriber(lightdashApi, 'project-1', true);
        expect(transcribe).not.toBeNull();
        const audio = new Blob(['abc'], { type: 'audio/webm' });
        await expect(transcribe!(audio)).resolves.toEqual(words);
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: expect.stringContaining(
                    '/ee/projects/project-1/apps/transcribe-capture',
                ),
                method: 'POST',
                body: audio,
                headers: { 'Content-Type': 'audio/webm' },
            }),
        );
    });
});
