import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureTranscriber } from './transcribeCapture';

describe('captureTranscriber', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is null when voice is not available on the instance', () => {
        expect(captureTranscriber('project-1', false)).toBeNull();
    });

    it('is null when availability is not known', () => {
        expect(captureTranscriber('project-1', undefined)).toBeNull();
    });

    it('posts the audio for the project when voice is available', async () => {
        const words = [{ startMs: 0, endMs: 200, text: 'hello' }];
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ status: 'ok', results: { words } }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const transcribe = captureTranscriber('project-1', true);
        expect(transcribe).not.toBeNull();
        await expect(
            transcribe!(new Blob(['abc'], { type: 'audio/webm' })),
        ).resolves.toEqual(words);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(
                '/api/v1/ee/projects/project-1/apps/transcribe-capture',
            ),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});
