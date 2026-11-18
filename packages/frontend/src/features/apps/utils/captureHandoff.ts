/** The part of a capture the builder puts in its prompt box. */
export type CaptureForBuilder = { images: File[]; summary: string };

type AppViewCaptureInput = {
    flagEnabled: boolean;
    canEditApp: boolean;
    /** The organization's switch for screenshots and attachments. */
    capturesEnabled: boolean;
    /** A running app is on screen to draw on. */
    hasPreview: boolean;
};

/** Whether the published app page offers a capture to the current user. */
export const canCaptureOnAppView = ({
    flagEnabled,
    canEditApp,
    capturesEnabled,
    hasPreview,
}: AppViewCaptureInput): boolean =>
    flagEnabled && canEditApp && capturesEnabled && hasPreview;

// Kept in memory only, so a page reload starts with nothing held.
let held: { appUuid: string; capture: CaptureForBuilder } | null = null;

/** Holds a capture made on the app page until that app's builder opens. */
export const holdCaptureForBuilder = (
    appUuid: string,
    capture: CaptureForBuilder,
): void => {
    held = { appUuid, capture };
};

/** Hands over the held capture once; any builder opening empties the holder. */
export const takeCaptureForBuilder = (
    appUuid: string,
): CaptureForBuilder | null => {
    const current = held;
    held = null;
    return current?.appUuid === appUuid ? current.capture : null;
};
