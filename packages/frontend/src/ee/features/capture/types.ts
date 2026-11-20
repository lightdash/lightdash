// Points and boxes are fractions (0 to 1) of the capture region, origin top left.
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type Stroke = { points: Point[] };
export type MarkShape = 'circle' | 'underline' | 'arrow' | 'scribble' | 'pick';
export type DesignTool = 'stylus' | 'cursor';
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
    tool: DesignTool;
    /** The dashboard tab the mark was made on; null when there are no tabs. */
    tabName: string | null;
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

/** Where the pixels come from: browser tab capture, or the page's own DOM. */
export type CaptureFrameSource = 'tab' | 'dom';

export type CaptureSurface = {
    getRegion: () => DOMRect;
    /** Defaults to tab capture. "dom" needs no share prompt. */
    frameSource?: CaptureFrameSource;
    /** False when the surface only needs marks and words, not pictures. */
    captureImages: boolean;
    /**
     * The surface's own picture of its whole page, from the top. Asked for
     * once when a recording starts; tab capture is used if it does not answer.
     */
    grabAppImage?: (() => Promise<Blob>) | null;
    /** What is at a viewport point (a tile, a data point). */
    resolveTarget:
        | ((point: { x: number; y: number }) => CaptureTarget | null)
        | null;
    /** Turns the recorded audio into timed words. Null means no voice. */
    transcribe: ((audio: Blob) => Promise<TranscriptWord[]>) | null;
    onCapture: (result: CaptureResult) => void;
};

export type VoiceState = 'on' | 'off';

export const MAX_CAPTURE_IMAGES = 5;

/** A page that offers Design Mode: where to draw, how to picture it, what is on it. */
export type DesignSurface = {
    getRegion: () => DOMRect;
    /** Scroll offset of the surface's content, for content coords. */
    getScroll: () => { x: number; y: number };
    frameSource: 'dom' | 'app';
    /** Required when frameSource is 'app'. */
    grabAppImage: (() => Promise<Blob>) | null;
    getTab: () => { uuid: string; name: string } | null;
    resolveTarget:
        | ((point: { x: number; y: number }) => CaptureTarget | null)
        | null;
    /** Cursor: the element under a viewport point, with its bounds. Null when Cursor is unsupported. */
    pickAt:
        | ((point: {
              x: number;
              y: number;
          }) => { target: CaptureTarget; rect: DOMRect } | null)
        | null;
    transcribe: ((audio: Blob) => Promise<TranscriptWord[]>) | null;
};

export type DesignPayload = {
    bubbleId: string;
    summary: string;
    marks: CaptureMark[];
    images: File[];
    transcript: TranscriptPhrase[];
};

export type DesignSendResult =
    | { threadId: string; agentUuid: string }
    | 'cancelled';

/** A mark kept on screen. Box and stroke points are content pixels (viewport plus scroll). */
export type LayerMark = {
    bubbleId: string;
    number: number;
    tabUuid: string | null;
    box: Box;
    strokes: Stroke[];
    /** A cursor pick: the element's bounds are outlined. */
    outlined: boolean;
};
