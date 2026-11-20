import { ParameterError } from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    audioFilenameForMimeType,
    parseTranscriptionWords,
    transcribeCaptureAudio,
    transcriptionLanguage,
} from './captureTranscription';

describe('parseTranscriptionWords', () => {
    it('turns second-based words into millisecond words', () => {
        expect(
            parseTranscriptionWords({
                words: [
                    { word: 'move', start: 1.2, end: 1.5 },
                    { word: ' this', start: 1.5, end: 1.82 },
                ],
            }),
        ).toEqual([
            { startMs: 1200, endMs: 1500, text: 'move' },
            { startMs: 1500, endMs: 1820, text: 'this' },
        ]);
    });

    it('drops words inside segments the model marked as silence', () => {
        expect(
            parseTranscriptionWords({
                words: [
                    { word: 'Thank', start: 0.2, end: 0.5 },
                    { word: 'you', start: 0.5, end: 0.8 },
                    { word: 'bigger', start: 4.1, end: 4.6 },
                ],
                segments: [
                    { start: 0, end: 1, no_speech_prob: 0.92 },
                    { start: 4, end: 5, no_speech_prob: 0.03 },
                ],
            }),
        ).toEqual([{ startMs: 4100, endMs: 4600, text: 'bigger' }]);
    });

    it('returns no words for a reply without any', () => {
        expect(parseTranscriptionWords({ text: '' })).toEqual([]);
        expect(parseTranscriptionWords(null)).toEqual([]);
    });

    it('skips malformed and empty words', () => {
        expect(
            parseTranscriptionWords({
                words: [
                    { word: '  ', start: 0, end: 0.1 },
                    { word: 'ok', start: 'x', end: 1 },
                    { word: 'title', start: 2, end: 2.4 },
                ],
            }),
        ).toEqual([{ startMs: 2000, endMs: 2400, text: 'title' }]);
    });
});

describe('audioFilenameForMimeType', () => {
    it('names the file by its container', () => {
        expect(audioFilenameForMimeType('audio/webm;codecs=opus')).toBe(
            'capture.webm',
        );
        expect(audioFilenameForMimeType('audio/mp4')).toBe('capture.mp4');
        expect(audioFilenameForMimeType('audio/ogg; codecs=opus')).toBe(
            'capture.ogg',
        );
    });

    it('rejects anything that is not audio', () => {
        expect(audioFilenameForMimeType('image/png')).toBeNull();
        expect(audioFilenameForMimeType('application/json')).toBeNull();
    });
});

describe('transcriptionLanguage', () => {
    it('reduces a browser locale to a two-letter language', () => {
        expect(transcriptionLanguage('en-GB')).toBe('en');
        expect(transcriptionLanguage('FR')).toBe('fr');
    });

    it('ignores anything that is not a language code', () => {
        expect(transcriptionLanguage(undefined)).toBeNull();
        expect(transcriptionLanguage('')).toBeNull();
        expect(transcriptionLanguage('english please')).toBeNull();
    });
});

describe('transcribeCaptureAudio', () => {
    const call = () =>
        transcribeCaptureAudio({
            apiKey: 'key',
            baseUrl: 'https://transcribe.test/v1',
            audio: Buffer.from('definitely not audio'),
            filename: 'capture.webm',
            mimeType: 'audio/webm',
            language: null,
        });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reports a recording the provider cannot read as a bad request', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('{}', { status: 400 })),
        );
        await expect(call()).rejects.toBeInstanceOf(ParameterError);
    });

    it('keeps other provider failures as server errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('{}', { status: 503 })),
        );
        const error = await call().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(ParameterError);
    });
});
