import { type GuidedTourStep } from '../../../../components/common/GuidedTour';

export type DesignModeSurface = 'dashboard' | 'builder' | 'app';

/** `data-tour` value on each surface's Design Mode button. */
export const DESIGN_MODE_BUTTON_TOUR_ID = 'design-mode-button';
/** `data-tour` values on the toolbar and its voice button. */
export const DESIGN_MODE_TOOLBAR_TOUR_ID = 'design-mode-toolbar';
export const DESIGN_MODE_VOICE_TOUR_ID = 'design-mode-voice';
/** From this step on the tour needs the toolbar, so it turns the mode on. */
export const FIRST_TOOLBAR_STEP = 1;

const THREADS = {
    title: 'Conversational threads',
    body: 'Each new set of marks gets its own bubble. You can carry on threads by opening them and using the hotkey to add more marks and voice transcriptions.',
};

const AFTER_SEND: Record<DesignModeSurface, { title: string; body: string }> = {
    dashboard: THREADS,
    app: THREADS,
    builder: {
        title: 'Send your marks to the builder',
        body: 'Each bubble waits in a tray under the preview. Mark as many things as you like, then send them to the builder together as one prompt.',
    },
};

/** The first-run tour for Design Mode on one surface. */
export const designModeTourSteps = (
    surface: DesignModeSurface,
): GuidedTourStep[] => [
    {
        target: `[data-tour="${DESIGN_MODE_BUTTON_TOUR_ID}"]`,
        title: 'Meet Design Mode',
        body: 'Mark or annotate UI elements to design content or request analysis. Press this button to turn it on.',
    },
    {
        target: `[data-tour="${DESIGN_MODE_TOOLBAR_TOUR_ID}"]`,
        title: 'Hold Option/Alt to mark',
        body: 'Use the hotkey to activate the marker. Once activated you can select elements or annotate the UI. On releasing the hotkey an agent bubble opens with your context added to it automatically.',
    },
    {
        target: `[data-tour="${DESIGN_MODE_VOICE_TOUR_ID}"]`,
        title: 'Voice Mode',
        body: 'When toggled on, using the hotkey will also activate the microphone, and anything you say while making annotations will be automatically transcribed to the agent bubble opened on release.',
    },
    { target: null, ...AFTER_SEND[surface] },
];
