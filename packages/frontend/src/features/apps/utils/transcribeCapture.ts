import {
    type ApiCaptureTranscriptResponse,
    type CaptureTranscriptWord,
} from '@lightdash/common';

/** Sends a capture's audio to be transcribed into timed words. */
export const transcribeCapture = async (
    projectUuid: string,
    audio: Blob,
): Promise<CaptureTranscriptWord[]> => {
    const response = await fetch(
        `/api/v1/ee/projects/${projectUuid}/apps/transcribe-capture`,
        {
            method: 'POST',
            body: audio,
            headers: { 'Content-Type': audio.type || 'audio/webm' },
        },
    );
    if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
    }
    const json = (await response.json()) as ApiCaptureTranscriptResponse;
    return json.results.words;
};
