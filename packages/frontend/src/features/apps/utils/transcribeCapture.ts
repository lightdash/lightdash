import {
    type ApiCaptureTranscriptResponse,
    type CaptureTranscriptWord,
} from '@lightdash/common';
import { type LightdashApi } from '../../../api';

/** Sends a capture's audio to be transcribed into timed words. */
const transcribeCapture = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    audio: Blob,
): Promise<CaptureTranscriptWord[]> => {
    const { words } = await lightdashApi<
        ApiCaptureTranscriptResponse['results']
    >({
        url: `/ee/projects/${projectUuid}/apps/transcribe-capture?language=${encodeURIComponent(navigator.language)}`,
        method: 'POST',
        body: audio,
        headers: { 'Content-Type': audio.type || 'audio/webm' },
        // The recording is the user's voice; keep it out of the error log.
        sensitive: true,
    });
    return words;
};

/**
 * The transcriber a capture surface gets: null when the instance cannot
 * transcribe (or that is not known yet), so no audio is recorded and lost.
 */
export const captureTranscriber = (
    lightdashApi: LightdashApi,
    projectUuid: string,
    voiceTranscriptionAvailable: boolean | undefined,
): ((audio: Blob) => Promise<CaptureTranscriptWord[]>) | null =>
    voiceTranscriptionAvailable
        ? (audio) => transcribeCapture(lightdashApi, projectUuid, audio)
        : null;
