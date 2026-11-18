import {
    type ApiCaptureTranscriptResponse,
    type CaptureTranscriptWord,
} from '@lightdash/common';

/** Sends a capture's audio to be transcribed into timed words. */
const transcribeCapture = async (
    projectUuid: string,
    audio: Blob,
): Promise<CaptureTranscriptWord[]> => {
    const response = await fetch(
        `/api/v1/ee/projects/${projectUuid}/apps/transcribe-capture?language=${encodeURIComponent(navigator.language)}`,
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

/**
 * The transcriber a capture surface gets: null when the instance cannot
 * transcribe (or that is not known yet), so no audio is recorded and lost.
 */
export const captureTranscriber = (
    projectUuid: string,
    voiceTranscriptionAvailable: boolean | undefined,
): ((audio: Blob) => Promise<CaptureTranscriptWord[]>) | null =>
    voiceTranscriptionAvailable
        ? (audio) => transcribeCapture(projectUuid, audio)
        : null;
