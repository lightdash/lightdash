import { type CaptureTranscriptWord } from '@lightdash/common';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const TRANSCRIPTION_MODEL = 'whisper-1';
// Above this the model itself thinks the segment is not speech.
const NO_SPEECH_THRESHOLD = 0.6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** Filename the transcription API needs to recognise the audio container. */
export const audioFilenameForMimeType = (mimeType: string): string | null => {
    const [type] = mimeType.split(';');
    const [kind, container] = type.trim().toLowerCase().split('/');
    if (kind !== 'audio' || !container) return null;
    if (container.includes('mp4') || container.includes('m4a'))
        return 'capture.mp4';
    if (container.includes('ogg')) return 'capture.ogg';
    if (container.includes('wav')) return 'capture.wav';
    if (container.includes('mpeg')) return 'capture.mp3';
    return 'capture.webm';
};

/** Browser locale to the two-letter code the transcription API takes. */
export const transcriptionLanguage = (
    locale: string | undefined,
): string | null => {
    const match = /^([a-z]{2})(-[a-z0-9]+)*$/i.exec(locale?.trim() ?? '');
    return match ? match[1].toLowerCase() : null;
};

/** Reads a verbose transcription reply into words timed in milliseconds. */
export const parseTranscriptionWords = (
    reply: unknown,
): CaptureTranscriptWord[] => {
    if (!isRecord(reply) || !Array.isArray(reply.words)) return [];
    const silent = (Array.isArray(reply.segments) ? reply.segments : [])
        .filter(isRecord)
        .filter(
            (segment) =>
                typeof segment.no_speech_prob === 'number' &&
                segment.no_speech_prob > NO_SPEECH_THRESHOLD &&
                typeof segment.start === 'number' &&
                typeof segment.end === 'number',
        )
        .map((segment) => ({
            start: segment.start as number,
            end: segment.end as number,
        }));

    return reply.words.filter(isRecord).flatMap((word) => {
        const { start, end } = word;
        const text = typeof word.word === 'string' ? word.word.trim() : '';
        if (typeof start !== 'number' || typeof end !== 'number' || !text) {
            return [];
        }
        const inSilence = silent.some(
            (segment) => start >= segment.start && start < segment.end,
        );
        if (inSilence) return [];
        return [
            {
                startMs: Math.round(start * 1000),
                endMs: Math.round(end * 1000),
                text,
            },
        ];
    });
};

export const transcribeCaptureAudio = async ({
    apiKey,
    baseUrl,
    audio,
    filename,
    mimeType,
    language,
}: {
    apiKey: string;
    baseUrl: string | null;
    audio: Buffer;
    filename: string;
    mimeType: string;
    /** Pinning the language stops silence being heard as another one. */
    language: string | null;
}): Promise<CaptureTranscriptWord[]> => {
    const form = new FormData();
    form.append(
        'file',
        new Blob([new Uint8Array(audio)], { type: mimeType }),
        filename,
    );
    form.append('model', TRANSCRIPTION_MODEL);
    if (language) form.append('language', language);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');

    const response = await fetch(
        `${baseUrl ?? DEFAULT_OPENAI_BASE_URL}/audio/transcriptions`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
        },
    );
    if (!response.ok) {
        throw new Error(`Transcription failed with status ${response.status}`);
    }
    return parseTranscriptionWords(await response.json());
};
