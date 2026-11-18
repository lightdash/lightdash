// Points and boxes are fractions (0 to 1) of the capture region, origin top left.
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type Stroke = { points: Point[] };
export type MarkShape = 'circle' | 'underline' | 'arrow' | 'scribble';
export type CaptureTarget = { kind: string; id: string; label: string };

/** A target under a mark and the share (0 to 1) of the mark's area on it. */
export type CaptureCover = { target: CaptureTarget; share: number };

export type CaptureMark = {
    number: number;
    imageIndex: number;
    startMs: number;
    endMs: number;
    strokes: Stroke[];
    shape: MarkShape;
    box: Box;
    arrow: { from: Point; to: Point } | null;
    /** What the mark is on; for an arrow, what it starts on. */
    target: CaptureTarget | null;
    /** What an arrow ends on. Null for other shapes. */
    arrowTo: CaptureTarget | null;
    /** Everything the strokes passed over, in drawing order, no repeats in a row. */
    trail: CaptureTarget[];
    /** What the area the mark encloses sits on, biggest share first. */
    covers: CaptureCover[];
};

// atMs is when the phrase started (its first interim result).
export type TranscriptPhrase = { atMs: number; text: string };

// A spoken word timed from the start of the audio recording.
export type TranscriptWord = { startMs: number; endMs: number; text: string };

export type CaptureResult = {
    images: File[];
    summary: string;
    marks: CaptureMark[];
    transcript: TranscriptPhrase[];
    durationMs: number;
};

export type CaptureSurface = {
    getRegion: () => DOMRect;
    /** False when the surface only needs marks and words, not pictures. */
    captureImages: boolean;
    /** What is at a viewport point (a tile, a data point). */
    resolveTarget:
        | ((point: { x: number; y: number }) => CaptureTarget | null)
        | null;
    /** Turns the recorded audio into timed words. Null means no voice. */
    transcribe: ((audio: Blob) => Promise<TranscriptWord[]>) | null;
    onCapture: (result: CaptureResult) => void;
};

export type VoiceState = 'on' | 'off';

export const MAX_CAPTURE_IMAGES = 9;
